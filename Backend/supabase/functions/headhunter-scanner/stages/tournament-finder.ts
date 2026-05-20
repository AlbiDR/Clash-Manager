// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import { DiscoveryAnchorSchema, DiscoveryCacheItemSchema, RoyaleTournamentListSchema, RoyaleTournamentSchema } from "../../_shared/schemas.ts";

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
        const { data: rawAnchors, error: anchorError } = await supabase.rpc('get_active_discovery_anchors', { p_limit: 36 });

        if (anchorError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Anchor fetch failed: ${anchorError.message}` });
            console.error(`[TOURNAMENT_DISCOVERY] Anchor fetch error: ${anchorError.message}. Falling back to hardcoded keywords.`);
        }

        // [GUARD] VALIDATION BOUNDARY: Supabase RPC results must be validated.
        // [THREAT:] Malformed RPC return or database view corruption could cause runtime errors.
        const anchorValidation = v.safeParse(v.array(DiscoveryAnchorSchema), rawAnchors ?? []);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            stage: 'ANCHOR_FETCH',
            passed: anchorValidation.success,
            details: anchorValidation.success ? 'Anchors validated' : 'Anchor validation failed'
        });

        const FALLBACK_KEYWORDS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
        const anchors = anchorValidation.success ? anchorValidation.output : [];
        const keywords = anchors.length > 0 ? anchors.map((anchor) => anchor.keyword) : FALLBACK_KEYWORDS;
        const isUsingFallback = keywords === FALLBACK_KEYWORDS;

        console.log(`[TOURNAMENT_DISCOVERY] Using ${keywords.length} keyword(s) (fallback=${isUsingFallback}): ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? ` +${keywords.length - 10} more` : ''}`);


        const { data: rawCached, error: cacheError } = await supabase.rpc('get_discovery_cache', { p_hours: 1 });
        if (cacheError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Cache fetch failed: ${cacheError.message}` });
        }

        // [GUARD] VALIDATION BOUNDARY: Discovery cache validation.
        // [THREAT:] Prevents runtime errors if the discovery cache view structure changes.
        const cacheValidation = v.safeParse(v.array(DiscoveryCacheItemSchema), rawCached ?? []);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            stage: 'CACHE_FETCH',
            passed: cacheValidation.success,
            details: cacheValidation.success ? 'Cache validated' : 'Cache validation failed'
        });

        const cachedItems = cacheValidation.success ? cacheValidation.output : [];
        const blacklist = new Set(cachedItems.map((item) => item.player_tag));
        console.log(`[TOURNAMENT_DISCOVERY] Loaded ${blacklist.size} cached tournaments to blacklist`);
        let discoveryCount = 0;

        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('TOURNAMENT_DISCOVERY', 'called', { keyword });
            console.log(`[TOURNAMENT_DISCOVERY] Starting search for keyword: '${keyword}'`);
            let keywordYield = 0;
            try {
                // [THREAT:] fetchWithRotation handles API key rotation to prevent IP/Token banning.
                const tournamentListResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                logAudit('TOURNAMENT_DISCOVERY', 'run', { keyword, status: tournamentListResponse.status });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' returned HTTP ${tournamentListResponse.status}`);
                if (!tournamentListResponse.ok) {
                    logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: `HTTP_${tournamentListResponse.status}` });
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' failed due to HTTP ${tournamentListResponse.status}`);
                    return;
                }
                
                const rawTournamentListData: unknown = await tournamentListResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes from unexpected Royale API changes in tournament search results.
                const listValidation = v.safeParse(RoyaleTournamentListSchema, rawTournamentListData);

                logAudit('TOURNAMENT_DISCOVERY', 'resulted_data', { keyword, items: listValidation.success ? listValidation.output.items.length : 0 });
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: listValidation.success,
                    details: listValidation.success ? 'Tournament list shape validated' : 'Malformed tournament list'
                });
                
                if (!listValidation.success) {
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' received invalid data shape`);
                    return;
                }

                const tournamentList = listValidation.output.items;

                const tournamentDetailTasks = tournamentList.map((tournamentTarget) => async () => {
                    // [DECISION LOG] Skip full tournaments and recently scanned tournaments to minimize API quota usage.
                    if (tournamentTarget.capacity === tournamentTarget.maxCapacity) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${tournamentTarget.tag}: full capacity`);
                        return;
                    }
                    if (blacklist.has(tournamentTarget.tag)) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${tournamentTarget.tag}: blacklisted/cached`);
                        return;
                    }
                    try {
                        const tournamentDetailResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTarget.tag)}`);
                        if (tournamentDetailResponse.ok) {
                            const rawTournamentDetails: unknown = await tournamentDetailResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Tournament details validation.
                            // [THREAT:] Prevents errors when processing members if the Royale API structure shifts.
                            const detailsValidation = v.safeParse(RoyaleTournamentSchema, rawTournamentDetails);

                            if (detailsValidation.success) {
                                const tournamentDetails = detailsValidation.output;
                                let foundInTournament = 0;
                                let skippedClanned = 0;

                                tournamentDetails.membersList.forEach((tournamentMember) => {
                                    // NOTE: tournamentMember.trophies here is the player's tournament score,
                                    // NOT their ladder trophy count. Trophy gating is delegated
                                    // to the profiler stage which fetches the full player profile.
                                    if (!tournamentMember.clan?.tag && !exclusionSet.has(tournamentMember.tag)) {
                                        candidates.set(tournamentMember.tag, "TOURNAMENT");
                                        discoveryCount++;
                                        keywordYield++;
                                        foundInTournament++;
                                    } else {
                                        skippedClanned++;
                                    }
                                });
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTarget.tag}: ${foundInTournament} candidates added, ${skippedClanned} players skipped (clanned or excluded)`);
                                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                                    tournament: tournamentTarget.tag,
                                    found: foundInTournament, 
                                    skipped: skippedClanned 
                                });
                            } else {
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTarget.tag} validation failed`);
                                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
                                    tournament: tournamentTarget.tag,
                                    passed: false,
                                    details: 'Malformed tournament details'
                                });
                            }
                            await supabase.rpc('upsert_discovery_cache', { p_tag: tournamentTarget.tag, p_type: 'TOURNAMENT' });
                        } else {
                            console.error(`[TOURNAMENT_DISCOVERY] Fetching details for tournament ${tournamentTarget.tag} failed with HTTP ${tournamentDetailResponse.status}`);
                        }
                    } catch (discoveryError: unknown) {
                        const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
                        console.error(`[TOURNAMENT_DISCOVERY] Exception while fetching tournament ${tournamentTarget.tag}: ${errorMessage}`);
                    }
                });
                await processBatch(tournamentDetailTasks, 10);

                // 2. Report yield for autonomy
                // [DECISION LOG] Reporting yield allows the system to prioritize keywords that produce more recruits.
                await supabase.rpc('report_anchor_yield', { 
                    p_keyword: keyword, 
                    p_yield: keywordYield 
                });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' complete. Total yield: ${keywordYield}`);

            } catch (discoveryError: unknown) {
                const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
                stats.errors.push(`Discovery(${keyword}): ${errorMessage}`);
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('TOURNAMENT_DISCOVERY', 'error', { keyword, message: errorMessage });
                console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' encountered exception: ${errorMessage}`);
            }
        });
        
        await processBatch(discoveryTasks, 5);
        console.log(`[TOURNAMENT_DISCOVERY] All keywords processed. Total new candidates discovered: ${discoveryCount}`);
        stats.discovery_targets += discoveryCount;
        if (stats.discovery_tournament !== undefined) stats.discovery_tournament += discoveryCount;
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { candidates: discoveryCount });
    } catch (discoveryError: unknown) {
        const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { error: true });
        console.error(`[TOURNAMENT_DISCOVERY] Fatal error in pipeline: ${errorMessage}`);
        throw discoveryError;
    }
}
