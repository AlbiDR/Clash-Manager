// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleTournamentListSchema, RoyaleTournamentSchema } from "../../_shared/schemas.ts";

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
        const { data: anchors, error: anchorError } = await supabase.schema('substrate' as any).rpc('get_active_discovery_anchors', { p_limit: 15 });

        if (anchorError) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Anchor fetch failed: ${anchorError.message}` });
            console.error(`[TOURNAMENT_DISCOVERY] Anchor fetch error: ${anchorError.message}. Falling back to hardcoded keywords.`);
        }

        const FALLBACK_KEYWORDS = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int", "open", "free", "all"];
        const keywords = (anchors as any[])?.map((anchor: any) => anchor.keyword) || FALLBACK_KEYWORDS;
        const isUsingFallback = !anchors || (anchors as any[]).length === 0;

        console.log(`[TOURNAMENT_DISCOVERY] Using ${keywords.length} keyword(s) (fallback=${isUsingFallback}): ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? ` +${keywords.length - 10} more` : ''}`);


        const { data: cached } = await supabase.schema('substrate').from('discovery_cache')
            .select('player_tag')
            .gte('scanned_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());
        const blacklist = new Set((cached as any[])?.map(c => c.player_tag) || []);
        console.log(`[TOURNAMENT_DISCOVERY] Loaded ${blacklist.size} cached tournaments to blacklist`);
        let count = 0;

        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('TOURNAMENT_DISCOVERY', 'called', { keyword });
            console.log(`[TOURNAMENT_DISCOVERY] Starting search for keyword: '${keyword}'`);
            let keywordYield = 0;
            try {
                const res = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                logAudit('TOURNAMENT_DISCOVERY', 'run', { keyword, status: res.status });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' returned HTTP ${res.status}`);
                if (!res.ok) {
                    logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: `HTTP_${res.status}` });
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' failed due to HTTP ${res.status}`);
                    return;
                }
                
                const rawTournamentListData = await res.json();

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
                        const detailRes = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTarget.tag)}`);
                        if (detailRes.ok) {
                            const rawTournamentDetails = await detailRes.json();

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
                                        count++;
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
                            console.error(`[TOURNAMENT_DISCOVERY] Fetching details for tournament ${tournamentTarget.tag} failed with HTTP ${detailRes.status}`);
                        }
                    } catch (tournamentDetailException: unknown) {
                        console.error(`[TOURNAMENT_DISCOVERY] Exception while fetching tournament ${tournamentTarget.tag}: ${tournamentDetailException instanceof Error ? tournamentDetailException.message : String(tournamentDetailException)}`);
                    }
                });
                await processBatch(tournamentTasks, 10);

                // 2. Report yield for autonomy
                await supabase.schema('substrate' as any).rpc('report_anchor_yield', { 
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
        console.log(`[TOURNAMENT_DISCOVERY] All keywords processed. Total new candidates discovered: ${count}`);
        stats.discovery_targets += count;
        if (stats.discovery_tournament !== undefined) stats.discovery_tournament += count;
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { candidates: count });
    } catch (tournamentDiscoveryException: unknown) {
        const errorMessage = tournamentDiscoveryException instanceof Error ? tournamentDiscoveryException.message : String(tournamentDiscoveryException);
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: errorMessage });
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { error: true });
        console.error(`[TOURNAMENT_DISCOVERY] Fatal error in pipeline: ${errorMessage}`);
        throw tournamentDiscoveryException;
    }
}
