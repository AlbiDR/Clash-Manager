// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import { DiscoveryAnchorSchema, DiscoveryCacheItemSchema, RoyaleTournamentListSchema, RoyaleTournamentSchema } from "../../_shared/schemas.ts";

const ANCHOR_LIMIT = 36;
const CACHE_HOURS = 5 / 60; // 5 minutes cache window
const TOURNAMENT_SEARCH_LIMIT = 50;
const BATCH_TOURNAMENTS = 25;
const BATCH_KEYWORDS = 30;

// Canonical tournament types as documented by the Royale API.
const KNOWN_TOURNAMENT_TYPES = new Set([
    'openTournament',
    'invitatioTournament',
]);

// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Runtime registry is volatile and will reset on cold start.
// [DECISION LOG] Keeping registry in-memory for performance; types are rediscovered lazily.
// Runtime registry seeded from KNOWN_TOURNAMENT_TYPES.
// Unknown types are added on first encounter and kept for the lifetime of the
// function instance (persists across warm-start re-invocations).
const runtimeTypeRegistry = new Set(KNOWN_TOURNAMENT_TYPES);

/**
 * Stage: Tournament Discovery
 * Scans active tournaments for un-clanned players meeting the trophy threshold.
 */
export async function runTournamentDiscovery(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('TOURNAMENT_DISCOVERY', 'triggered');
    console.log(`[TOURNAMENT_DISCOVERY] Triggered. Candidates map size: ${candidates.size}, Exclusion set size: ${exclusionSet.size}, Required trophies: ${requiredTrophies}`);
    try {
        // 1. Fetch Autonomous Anchors
        // [DECISION LOG] Anchors are keywords stored in the database to guide the discovery engine autonomously.
        // [SCHEMA] The data API only exposes the `public` schema to RPC. A thin
        // public.get_active_discovery_anchors wrapper (migration) delegates to the
        // substrate implementation - same pattern as get_shadow_discovery_targets / get_discovery_cache.
        const { data: discoveryAnchorsRaw, error: discoveryAnchorsError } = await supabase.rpc('get_active_discovery_anchors', { p_limit: ANCHOR_LIMIT });

        if (discoveryAnchorsError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Anchor fetch failed: ${discoveryAnchorsError.message}` });
            console.error(`[TOURNAMENT_DISCOVERY] Anchor fetch error: ${discoveryAnchorsError.message}. Falling back to hardcoded keywords.`);
        }

        // [GUARD] VALIDATION BOUNDARY: Supabase RPC results must be validated.
        // [THREAT:] Malformed RPC return or database view corruption could cause runtime errors.
        const discoveryAnchorsIntegrity = v.safeParse(v.array(DiscoveryAnchorSchema), discoveryAnchorsRaw ?? []);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            stage: 'ANCHOR_FETCH',
            passed: discoveryAnchorsIntegrity.success,
            details: discoveryAnchorsIntegrity.success ? 'Anchors validated' : 'Anchor validation failed'
        });

        const FALLBACK_KEYWORDS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
        const anchors = discoveryAnchorsIntegrity.success ? discoveryAnchorsIntegrity.output : [];
        const keywords = anchors.length > 0 ? anchors.map((anchor) => anchor.keyword) : FALLBACK_KEYWORDS;
        const isUsingFallback = keywords === FALLBACK_KEYWORDS;

        console.log(`[TOURNAMENT_DISCOVERY] Using ${keywords.length} keyword(s) (fallback=${isUsingFallback}): ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? ` +${keywords.length - 10} more` : ''}`);


        const { data: discoveryCacheRaw, error: discoveryCacheError } = await supabase.rpc('get_discovery_cache', { p_hours: CACHE_HOURS });
        if (discoveryCacheError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Cache fetch failed: ${discoveryCacheError.message}` });
        }

        // [GUARD] VALIDATION BOUNDARY: Discovery cache validation.
        // [THREAT:] Prevents runtime errors if the discovery cache view structure changes.
        const discoveryCacheIntegrity = v.safeParse(v.array(DiscoveryCacheItemSchema), discoveryCacheRaw ?? []);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            stage: 'CACHE_FETCH',
            passed: discoveryCacheIntegrity.success,
            details: discoveryCacheIntegrity.success ? 'Cache validated' : 'Cache validation failed'
        });

        const discoveryCacheSnapshot = discoveryCacheIntegrity.success ? discoveryCacheIntegrity.output : [];
        const blacklist = new Set(discoveryCacheSnapshot.map((cacheItemCandidate) => cacheItemCandidate.player_tag));
        console.log(`[TOURNAMENT_DISCOVERY] Loaded ${blacklist.size} cached tournaments to blacklist`);
        let discoveryCount = 0;

        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('TOURNAMENT_DISCOVERY', 'called', { keyword });
            console.log(`[TOURNAMENT_DISCOVERY] Starting search for keyword: '${keyword}'`);
            let keywordYield = 0;
            try {
                // [THREAT:] fetchWithRotation handles API key rotation to prevent IP/Token banning.
                const tournamentListApiResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=${TOURNAMENT_SEARCH_LIMIT}`);
                logAudit('TOURNAMENT_DISCOVERY', 'run', { keyword, status: tournamentListApiResponse.status });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' returned HTTP ${tournamentListApiResponse.status}`);
                if (!tournamentListApiResponse.ok) {
                    logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: `HTTP_${tournamentListApiResponse.status}` });
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' failed due to HTTP ${tournamentListApiResponse.status}`);
                    return;
                }
                
                const tournamentListRaw: unknown = await tournamentListApiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes from unexpected Royale API changes in tournament search results.
                const tournamentListIntegrity = v.safeParse(RoyaleTournamentListSchema, tournamentListRaw);

                logAudit('TOURNAMENT_DISCOVERY', 'resulted_data', { keyword, items: tournamentListIntegrity.success ? tournamentListIntegrity.output.items.length : 0 });
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: tournamentListIntegrity.success,
                    details: tournamentListIntegrity.success ? 'Tournament list shape validated' : 'Malformed tournament list'
                });
                
                if (!tournamentListIntegrity.success) {
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' received invalid data shape`);
                    return;
                }

                const tournamentList = [...tournamentListIntegrity.output.items].sort(
                    (firstTournament, secondTournament) => secondTournament.capacity - firstTournament.capacity
                );

                // [DECISION LOG] Calculating type distribution to monitor API behavior and discovery health.
                // [THREAT:] Anemic variables ('acc', 't', 't_type') can lead to logic corruption during refactoring.
                const typeDistribution = tournamentList.reduce((typeDistributionAccumulator, tournamentItemCandidate) => {
                    const tournamentTypeCandidate = tournamentItemCandidate.type ?? 'unknown';
                    typeDistributionAccumulator[tournamentTypeCandidate] = (typeDistributionAccumulator[tournamentTypeCandidate] ?? 0) + 1;
                    return typeDistributionAccumulator;
                }, {} as Record<string, number>);
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' list: ${tournamentList.length} tournaments, types=${JSON.stringify(typeDistribution)}`);

                for (const observedType of Object.keys(typeDistribution)) {
                    if (observedType !== 'unknown' && !runtimeTypeRegistry.has(observedType)) {
                        // [DECISION LOG] Auto-discovery of new tournament types ensures the system adapts to Royale API shifts.
                        // [THREAT:] Unknown types may require specialized parsing logic; we track them via telemetry for clinical auditing.
                        runtimeTypeRegistry.add(observedType);
                        console.warn(`[TOURNAMENT_DISCOVERY] NEW TOURNAMENT TYPE DISCOVERED: '${observedType}' - added to runtime registry (now ${runtimeTypeRegistry.size} known types)`);
                        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
                            passed: true,
                            details: `new_tournament_type_discovered: ${observedType}`,
                            known_types: [...runtimeTypeRegistry]
                        });
                    }
                }

                const tournamentDetailTasks = tournamentList.map((tournamentTargetCandidate) => async () => {
                    if (blacklist.has(tournamentTargetCandidate.tag)) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${tournamentTargetCandidate.tag}: blacklisted/cached`);
                        return;
                    }
                    try {
                        const tournamentDetailApiResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTargetCandidate.tag)}`);
                        if (tournamentDetailApiResponse.ok) {
                            const tournamentDetailsRaw: unknown = await tournamentDetailApiResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Tournament details validation.
                            // [THREAT:] Prevents errors when processing members if the Royale API structure shifts.
                            const tournamentDetailsIntegrity = v.safeParse(RoyaleTournamentSchema, tournamentDetailsRaw);

                            if (tournamentDetailsIntegrity.success) {
                                const tournamentDetailsSnapshot = tournamentDetailsIntegrity.output;
                                const tournamentType = tournamentDetailsSnapshot.type ?? 'unknown';
                                let foundInTournament = 0;
                                let skippedClanned = 0;
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTargetCandidate.tag} type=${tournamentType} members=${tournamentDetailsSnapshot.membersList.length}`);

                                if (tournamentDetailsSnapshot.membersList.length === 0) {
                                    const isUnknownType = !KNOWN_TOURNAMENT_TYPES.has(tournamentType);
                                    if (isUnknownType) {
                                        console.warn(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTargetCandidate.tag} type=${tournamentType} returned 0 members - unknown type may use a different member field name`);
                                        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
                                            passed: false,
                                            details: `empty_membersList_unknown_type: ${tournamentTargetCandidate.tag} type=${tournamentType}`,
                                        });
                                    } else {
                                        console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTargetCandidate.tag} is empty (0 members).`);
                                    }
                                }

                                tournamentDetailsSnapshot.membersList.forEach((memberCandidate) => {
                                    // NOTE: tournamentMember.trophies here is the player's tournament score,
                                    // NOT their ladder trophy count. Trophy gating is delegated
                                    // to the profiler stage which fetches the full player profile.
                                    if (!memberCandidate.clan?.tag && !exclusionSet.has(memberCandidate.tag)) {
                                        candidates.set(memberCandidate.tag, "TOURNAMENT");
                                        discoveryCount++;
                                        keywordYield++;
                                        foundInTournament++;
                                    } else {
                                        skippedClanned++;
                                    }
                                });
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTargetCandidate.tag}: ${foundInTournament} candidates added, ${skippedClanned} players skipped (clanned or excluded)`);
                                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                                    tournament: tournamentTargetCandidate.tag,
                                    found: foundInTournament, 
                                    skipped: skippedClanned 
                                });
                            } else {
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTargetCandidate.tag} validation failed`);
                                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
                                    tournament: tournamentTargetCandidate.tag,
                                    passed: false,
                                    details: 'Malformed tournament details'
                                });
                            }
                            // [THREAT:] supabase.rpc() resolves with { error } instead of throwing. An
                            // unchecked failure here never populates the discovery cache, so the
                            // blacklist stays empty and every tournament detail is re-fetched on every
                            // run - pure Royale API quota amplification with zero added signal.
                            const { error: discoveryCacheUpsertError } = await supabase.rpc('upsert_discovery_cache', { p_tag: tournamentTargetCandidate.tag, p_type: 'TOURNAMENT' });
                            if (discoveryCacheUpsertError) {
                                stats.errors.push(`DiscoveryCache(${tournamentTargetCandidate.tag}): ${discoveryCacheUpsertError.message}`);
                                logAudit('TOURNAMENT_DISCOVERY', 'error', {
                                    tournament: tournamentTargetCandidate.tag,
                                    message: 'Discovery cache upsert failed - tournament will be re-fetched next run',
                                    details: discoveryCacheUpsertError
                                });
                                console.error(`[TOURNAMENT_DISCOVERY] Discovery cache upsert failed for ${tournamentTargetCandidate.tag}: ${discoveryCacheUpsertError.message}`);
                            }
                        } else {
                            console.error(`[TOURNAMENT_DISCOVERY] Fetching details for tournament ${tournamentTargetCandidate.tag} failed with HTTP ${tournamentDetailApiResponse.status}`);
                        }
                    } catch (discoveryExecutionError: unknown) {
                        const errorMessage = discoveryExecutionError instanceof Error ? discoveryExecutionError.message : String(discoveryExecutionError);
                        console.error(`[TOURNAMENT_DISCOVERY] Exception while fetching tournament ${tournamentTargetCandidate.tag}: ${errorMessage}`);
                    }
                });
                await processBatch(tournamentDetailTasks, BATCH_TOURNAMENTS);

                // 2. Report yield for autonomy
                // [DECISION LOG] Reporting yield allows the system to prioritize keywords that produce more recruits.
                // [THREAT:] supabase.rpc() resolves with { error } instead of throwing. A silently
                // dropped yield report freezes anchor prioritization on stale scores, so the
                // discovery engine keeps spending quota on keywords that stopped producing.
                const { error: anchorYieldError } = await supabase.rpc('report_anchor_yield', {
                    p_keyword: keyword,
                    p_yield: keywordYield
                });
                if (anchorYieldError) {
                    stats.errors.push(`AnchorYield(${keyword}): ${anchorYieldError.message}`);
                    logAudit('TOURNAMENT_DISCOVERY', 'error', { keyword, message: 'Anchor yield report failed', details: anchorYieldError });
                    console.error(`[TOURNAMENT_DISCOVERY] Anchor yield report failed for '${keyword}': ${anchorYieldError.message}`);
                }
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' complete. Total yield: ${keywordYield}`);

            } catch (discoveryExecutionError: unknown) {
                const errorMessage = discoveryExecutionError instanceof Error ? discoveryExecutionError.message : String(discoveryExecutionError);
                stats.errors.push(`Discovery(${keyword}): ${errorMessage}`);
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('TOURNAMENT_DISCOVERY', 'error', { keyword, message: errorMessage });
                console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' encountered exception: ${errorMessage}`);
            }
        });
        
        await processBatch(discoveryTasks, BATCH_KEYWORDS);
        console.log(`[TOURNAMENT_DISCOVERY] All keywords processed. Total new candidates discovered: ${discoveryCount}`);
        stats.discovery_targets += discoveryCount;
        if (stats.discovery_tournament !== undefined) stats.discovery_tournament += discoveryCount;
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { candidates: discoveryCount });
    } catch (discoveryExecutionError: unknown) {
        const errorMessage = discoveryExecutionError instanceof Error ? discoveryExecutionError.message : String(discoveryExecutionError);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { error: true });
        console.error(`[TOURNAMENT_DISCOVERY] Fatal error in pipeline: ${errorMessage}`);
        throw discoveryExecutionError;
    }
}
