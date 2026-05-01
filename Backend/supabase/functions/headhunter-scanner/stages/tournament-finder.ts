// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage: Tournament Discovery
 * Scans active tournaments for un-clanned players meeting the trophy threshold.
 */
export async function runTournamentDiscovery(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    logAudit('TOURNAMENT_DISCOVERY', 'triggered');
    console.log(`[TOURNAMENT_DISCOVERY] Triggered. Candidates map size: ${candidates.size}, Exclusion set size: ${exclusionSet.size}, Required trophies: ${requiredTrophies}`);
    try {
        // 1. Fetch Autonomous Anchors
        const { data: anchors, error: aErr } = await supabase.schema('substrate' as any).rpc('get_active_discovery_anchors', { p_limit: 15 });

        if (aErr) {
            logAudit('TOURNAMENT_DISCOVERY', 'error', { message: `Anchor fetch failed: ${aErr.message}` });
            console.error(`[TOURNAMENT_DISCOVERY] Anchor fetch error: ${aErr.message}. Falling back to hardcoded keywords.`);
        }

        const FALLBACK_KEYWORDS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
        const keywords = anchors?.map((a: any) => a.keyword) || FALLBACK_KEYWORDS;
        const isUsingFallback = !anchors || anchors.length === 0;

        console.log(`[TOURNAMENT_DISCOVERY] Using ${keywords.length} keyword(s) (fallback=${isUsingFallback}): ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? ` +${keywords.length - 10} more` : ''}`);


        const { data: cached } = await supabase.schema('substrate').from('discovery_cache')
            .select('player_tag')
            .gte('scanned_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());
        const blacklist = new Set(cached?.map(c => c.player_tag) || []);
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
                
                const data = await res.json();
                const isValid = data && Array.isArray(data.items);
                logAudit('TOURNAMENT_DISCOVERY', 'resulted_data', { keyword, items: data.items?.length });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' found ${data.items?.length || 0} tournaments`);
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: isValid, 
                    details: isValid ? 'Data shape validated (Array)' : 'Unexpected data shape' 
                });
                
                if (!isValid) {
                    console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' received invalid data shape`);
                    return;
                }

                const tTasks = (data.items || []).map((t: any) => async () => {
                    if (t.capacity === t.maxCapacity) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${t.tag}: full capacity`);
                        return;
                    }
                    if (blacklist.has(t.tag)) {
                        console.log(`[TOURNAMENT_DISCOVERY] Skipping tournament ${t.tag}: blacklisted/cached`);
                        return;
                    }
                    try {
                        const deRes = await fetchWithRotation(`/tournaments/${encodeURIComponent(t.tag)}`);
                        if (deRes.ok) {
                            const details = await deRes.json();
                            if (details.membersList) {
                                let foundInTournament = 0;
                                let skippedClanned = 0;
                                details.membersList.forEach((m: any) => {
                                    // NOTE: m.trophies here is the player's tournament score,
                                    // NOT their ladder trophy count. Trophy gating is delegated
                                    // to the profiler stage which fetches the full player profile.
                                    if (!m.clan?.tag && !exclusionSet.has(m.tag)) {
                                        candidates.set(m.tag, "TOURNAMENT");
                                        count++;
                                        keywordYield++;
                                        foundInTournament++;
                                    } else {
                                        skippedClanned++;
                                        // Log detailed skip reason periodically or in summary to avoid log bloat
                                    }
                                });
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${t.tag}: ${foundInTournament} candidates added, ${skippedClanned} players skipped (clanned or excluded)`);
                                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { 
                                    tournament: t.tag, 
                                    found: foundInTournament, 
                                    skipped: skippedClanned 
                                });
                            } else {
                                console.log(`[TOURNAMENT_DISCOVERY] Tournament ${t.tag} had no membersList property`);
                            }
                            await supabase.schema('substrate').from('discovery_cache').upsert({ player_tag: t.tag, type: 'TOURNAMENT' });
                        } else {
                            console.error(`[TOURNAMENT_DISCOVERY] Fetching details for tournament ${t.tag} failed with HTTP ${deRes.status}`);
                        }
                    } catch (e: any) { 
                        console.error(`[TOURNAMENT_DISCOVERY] Exception while fetching tournament ${t.tag}: ${e.message}`);
                    }
                });
                await processBatch(tTasks, 10);

                // 2. Report yield for autonomy
                await supabase.schema('substrate' as any).rpc('report_anchor_yield', { 
                    p_keyword: keyword, 
                    p_yield: keywordYield 
                });
                console.log(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' complete. Total yield: ${keywordYield}`);

            } catch (e: any) { 
                stats.errors.push(`Discovery(${keyword}): ${e.message}`); 
                logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: e.message });
                logAudit('TOURNAMENT_DISCOVERY', 'error', { keyword, message: e.message });
                console.error(`[TOURNAMENT_DISCOVERY] Keyword '${keyword}' encountered exception: ${e.message}`);
            }
        });
        
        await processBatch(discoveryTasks, 5);
        console.log(`[TOURNAMENT_DISCOVERY] All keywords processed. Total new candidates discovered: ${count}`);
        stats.discovery_targets += count;
        if (stats.discovery_tournament !== undefined) stats.discovery_tournament += count;
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { candidates: count });
    } catch (e: any) {
        logAudit('TOURNAMENT_DISCOVERY', 'integrity_checked', { passed: false, details: e.message });
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: e.message });
        logAudit('TOURNAMENT_DISCOVERY', 'terminated', { error: true });
        console.error(`[TOURNAMENT_DISCOVERY] Fatal error in pipeline: ${e.message}`);
        throw e;
    }
}
