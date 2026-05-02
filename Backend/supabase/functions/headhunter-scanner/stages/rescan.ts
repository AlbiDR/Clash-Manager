// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage: Stale Recruit Re-scan
 * Re-profiles ACTIVE recruits not scanned in the last 48 hours to keep
 * trophy counts, donation stats, and clan status fresh. Automatically
 * removes candidates who have since joined a clan (no longer valid targets).
 */
export async function runRescan(
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    logAudit('RESCAN', 'triggered');
    console.log(`[RESCAN] Triggered. Fetching stale recruits...`);
    try {
        const { data: stale, error: rpcErr } = await supabase
            .rpc('get_stale_recruits', { p_limit: 250 });

        logAudit('RESCAN', 'run', { count: stale?.length ?? 0, error: rpcErr?.message });

        if (rpcErr || !stale || stale.length === 0) {
            if (rpcErr) {
                logAudit('RESCAN', 'integrity_checked', { passed: false, details: rpcErr.message });
                console.error(`[RESCAN] RPC error: ${rpcErr.message}`);
            } else {
                console.log(`[RESCAN] No stale targets found to rescan.`);
            }
            logAudit('RESCAN', 'terminated', { reason: 'no_stale_targets' });
            return;
        }

        const isValid = Array.isArray(stale);
        logAudit('RESCAN', 'resulted_data', { count: stale.length });
        logAudit('RESCAN', 'integrity_checked', {
            passed: isValid,
            details: isValid ? 'Stale target list validated (Array)' : 'Unexpected data shape'
        });
        
        console.log(`[RESCAN] Validated ${stale.length} stale recruits to process.`);

        const validRescans: any[] = [];
        const rescanTasks = stale.map((row: { player_tag: string }) => async () => {
            const tag = row.player_tag;
            try {
                const res = await fetchWithRotation(`/players/${encodeURIComponent(tag)}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('RESCAN', 'called', { tag, action: 'purged_ghost' });
                        console.log(`[RESCAN] Player ${tag} is a ghost (404). Purged.`);
                    } else {
                        logAudit('RESCAN', 'error', { tag, status: res.status });
                        console.error(`[RESCAN] Player ${tag} fetch failed with HTTP ${res.status}`);
                    }
                    return;
                }

                const p = await res.json();
                if (!p?.tag) {
                    console.error(`[RESCAN] Player ${tag} returned invalid data shape.`);
                    return;
                }

                // If player has joined a clan, remove them from the recruit pool
                if (p.clan?.tag && !exclusionSet.has(p.tag)) {
                    await supabase.from('recruits')
                        .delete()
                        .eq('player_tag', p.tag);
                    logAudit('RESCAN', 'called', { tag, action: 'purged_clanned' });
                    console.log(`[RESCAN] Player ${tag} joined clan ${p.clan.tag}. Purged from recruits.`);
                    return;
                }

                // Otherwise prepare their profile data for batch refresh
                validRescans.push({
                    player_tag: p.tag,
                    player_name: p.name,
                    trophies: p.trophies || 0,
                    donations: p.totalDonations || 0,
                    cards: p.challengeCardsWon || 0,
                    war_wins: p.warDayWins || 0,
                    source: 'TOURNAMENT', // Fallback
                    status: (p.trophies || 0) >= requiredTrophies ? 'ACTIVE' : 'QUEUE'
                });

                console.log(`[RESCAN] Player ${tag} prepared for refresh. trophies=${p.trophies}`);
                stats.profiles_scanned++;
            } catch (e: any) {
                logAudit('RESCAN', 'error', { tag, message: e.message });
                console.error(`[RESCAN] Exception while processing ${tag}: ${e.message}`);
            }
        });

        console.log(`[RESCAN] Batch processing ${stale.length} rescan tasks...`);
        await processBatch(rescanTasks, 10);

        if (validRescans.length > 0) {
            console.log(`[RESCAN] Synchronizing ${validRescans.length} refreshed profiles via RPC...`);
            const { error: syncErr } = await supabase.rpc('sync_recruits', { p_recruits: validRescans });
            if (syncErr) {
                console.error(`[RESCAN] Sync failure: ${syncErr.message}`);
                logAudit('RESCAN', 'error', { message: 'Batch sync failed', details: syncErr });
            } else {
                stats.rescans_processed = validRescans.length;
                console.log(`[RESCAN] Successfully synchronized ${validRescans.length} profiles.`);
            }
        }
        logAudit('RESCAN', 'terminated', { candidates: stale.length, rescanned: stats.rescans_processed });
        console.log(`[RESCAN] Terminated smoothly. Processed ${stale.length} candidates, refreshed ${stats.rescans_processed} successfully.`);
    } catch (e: any) {
        stats.errors.push(`Rescan: ${e.message}`);
        logAudit('RESCAN', 'integrity_checked', { passed: false, details: e.message });
        logAudit('RESCAN', 'error', { message: e.message });
        logAudit('RESCAN', 'terminated', { error: true });
        console.error(`[RESCAN] Fatal exception: ${e.message}`);
    }
}
