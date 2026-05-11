// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleTournamentListSchema, RoyaleTournamentSchema, DiscoveryAnchorSchema, DiscoveryCacheItemSchema } from "../../_shared/schemas.ts";

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
        const { data: rawAnchors, error: anchorError } = await supabase.schema('substrate').rpc('get_active_discovery_anchors', { p_limit: 15 });

        if (anchorError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Anchor fetch failed: ${anchorError.message}` });
            console.error(`[TOURNAMENT_DISCOVERY] Anchor fetch error: ${anchorError.message}. Falling back to hardcoded keywords.`);
        }

        // [GUARD] VALIDATION BOUNDARY: Target B [1]
        // Rationale: Harden autonomous anchors fetched from substrate to prevent corrupted keywords.
        const parsedAnchors = v.safeParse(v.array(DiscoveryAnchorSchema), rawAnchors);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            passed: parsedAnchors.success,
            details: parsedAnchors.success ? 'Autonomous anchors validated' : 'Malformed anchor data'
        });

        const FALLBACK_KEYWORDS = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int", "open", "free", "all"];
        const keywords = parsedAnchors.success ? parsedAnchors.output.map(anchor => anchor.keyword) : FALLBACK_KEYWORDS;
        const isUsingFallback = !parsedAnchors.success || parsedAnchors.output.length === 0;

        console.log(`[TOURNAMENT_DISCOVERY] Using ${keywords.length} keyword(s) (fallback=${isUsingFallback}): ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? ` +${keywords.length - 10} more` : ''}`);


        const { data: rawCached } = await supabase.schema('substrate').from('discovery_cache')
            .select('player_tag')
            .gte('scanned_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

        // [GUARD] VALIDATION BOUNDARY: Target B [1]
        // Rationale: Harden discovery cache data to ensure the blacklist set is reliable.
        const parsedCached = v.safeParse(v.array(DiscoveryCacheItemSchema), rawCached);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', {
            passed: parsedCached.success,
            details: parsedCached.success ? 'Discovery cache validated' : 'Malformed cache data'
        });

        const blacklist = new Set(parsedCached.success ? parsedCached.output.map(c => c.player_tag) : []);
        console.log(`[TOURNAMENT_DISCOVERY] Loaded ${blacklist.size} cached tournaments to blacklist`);
        let newCandidatesCount = 0;

        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('TOURNAMENT_DISCOVERY', 'called', { keyword });
            console.log(`[TOURNAMENT_DISCOVERY] Starting search for keyword: '${keyword}'`);
            let keywordYield = 0;
            try {
                const tournamentListResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                logAudit('TOURNAMENT_DISCOVERY', 'run', { keyword, status: tournamentListResponse.status });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' returned HTTP ${tournamentListResponse.status}`);
                if (!tournamentListResponse.ok) {
                    logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: `HTTP_${tournamentListResponse.status}` });
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' failed due to HTTP ${tournamentListResponse.status}`);
                    return;
                }
                
                const rawTournamentListData = await tournamentListResponse.json();

                // [GUARD] VALIDATION BOUNDARY: Target B [1]
                // THREAT: Malformed tournament list response could crash the batch loop.
                const parsedList = v.safeParse(RoyaleTournamentListSchema, rawTournamentListData);

                logAudit('TOURNAMENT_DISCOVERY', 'resulted_data', { keyword, items: parsedList.success ? parsedList.output.items.length : 0 });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' found ${parsedList.success ? parsedList.output.items.length : 0} tournaments`);
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: parsedList.success,
                    details: parsedList.success ? 'Data shape validated (Tournament List)' : 'Unexpected tournament list data shape'
                });
                
                if (!parsedList.success) {
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' received invalid data shape`);
                    return;
                }

                const tournamentTasks = (parsedList.output.items).map((tournamentTarget) => async () => {
                    if (tournamentTarget.capacity === tournamentTarget.maxCapacity) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${tournamentTarget.tag}: full capacity`);
                        return;
                    }
                    if (blacklist.has(tournamentTarget.tag)) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${tournamentTarget.tag}: blacklisted/cached`);
                        return;
                    }
                    try {
                        const tournamentDetailsResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTarget.tag)}`);
                        if (tournamentDetailsResponse.ok) {
                            const rawTournamentDetails = await tournamentDetailsResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Target B [1]
                            // THREAT: Corrupted tournament details payload poisoning the discovery candidates map.
                            const parsedDetails = v.safeParse(RoyaleTournamentSchema, rawTournamentDetails);

                            if (parsedDetails.success) {
                                let foundInTournament = 0;
                                let skippedClanned = 0;
                                parsedDetails.output.membersList.forEach((tournamentMember) => {
                                    // NOTE: tournamentMember.trophies here is the player's tournament score,
                                    // NOT their ladder trophy count. Trophy gating is delegated
                                    // to the profiler stage which fetches the full player profile.
                                    if (!tournamentMember.clan?.tag && !exclusionSet.has(tournamentMember.tag)) {
                                        candidates.set(tournamentMember.tag, "TOURNAMENT");
                                        newCandidatesCount++;
                                        keywordYield++;
                                        foundInTournament++;
                                    } else if (tournamentMember.clan?.tag) {
                                        skippedClanned++;
                                    }
                                });
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTarget.tag}: ${foundInTournament} candidates added, ${skippedClanned} clanned players skipped`);
                                await supabase.schema('substrate').from('discovery_cache').upsert({ player_tag: tournamentTarget.tag, type: 'TOURNAMENT' });
                            } else {
                                console.error(`[TOURNAMENT_DISCOVERY] Tournament ${tournamentTarget.tag} returned invalid details shape.`);
                            }
                        } else {
                            console.error(`[TOURNAMENT_DISCOVERY] Fetching details for tournament ${tournamentTarget.tag} failed with HTTP ${tournamentDetailsResponse.status}`);
                        }
                    } catch (tournamentDetailException: unknown) {
                        console.error(`[TOURNAMENT_DISCOVERY] Exception while fetching tournament ${tournamentTarget.tag}: ${tournamentDetailException instanceof Error ? tournamentDetailException.message : String(tournamentDetailException)}`);
                    }
                });
                await processBatch(tournamentTasks, 10);

                // 2. Report yield for autonomy
                await supabase.schema('substrate').rpc('report_anchor_yield', {
                    p_keyword: keyword, 
                    p_yield: keywordYield 
                });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' complete. Total yield: ${keywordYield}`);

            } catch (keywordDiscoveryException: unknown) {
                const errorMessage = keywordDiscoveryException instanceof Error ? keywordDiscoveryException.message : String(keywordDiscoveryException);
                stats.errors.push(`Discovery(${keyword}): ${errorMessage}`);
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('TOURNAMENT_DISCOVERY', 'error', { keyword, message: errorMessage });
                console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' encountered exception: ${errorMessage}`);
            }
        });
        
        await processBatch(discoveryTasks, 5);
        console.log(`[TOURNAMENT_DISCOVERY] All keywords processed. Total new candidates discovered: ${newCandidatesCount}`);
        stats.discovery_targets += newCandidatesCount;
        if (stats.discovery_tournament !== undefined) stats.discovery_tournament += newCandidatesCount;
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { candidates: newCandidatesCount });
    } catch (tournamentDiscoveryException: unknown) {
        const errorMessage = tournamentDiscoveryException instanceof Error ? tournamentDiscoveryException.message : String(tournamentDiscoveryException);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { error: true });
        console.error(`[TOURNAMENT_DISCOVERY] Fatal error in pipeline: ${errorMessage}`);
        throw tournamentDiscoveryException;
    }
}
