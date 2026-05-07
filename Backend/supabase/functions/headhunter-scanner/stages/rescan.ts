// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyalePlayerSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

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
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('RESCAN', 'triggered');
    console.log(`[RESCAN] Triggered. Fetching stale recruits...`);
    try {
        const { data: rawStale, error: rpcErr } = await supabase
            .rpc('get_stale_recruits', { p_limit: 30 });

        logAudit('RESCAN', 'run', { count: Array.isArray(rawStale) ? rawStale.length : 0, error: rpcErr?.message });

        if (rpcErr || !rawStale || (rawStale as any[]).length === 0) {
            if (rpcErr) {
                logAudit('RESCAN', 'integrity_checked', { passed: false, details: rpcErr.message });
                console.error(`[RESCAN] RPC error: ${rpcErr.message}`);
            } else {
                console.log(`[RESCAN] No stale targets found to rescan.`);
            }
            logAudit('RESCAN', 'terminated', { reason: 'no_stale_targets' });
            return;
        }

        // [GUARD] VALIDATION BOUNDARY: Target B [1]
        // Rationale: Harden stale recruit list from RPC.
        const parsedStale = v.safeParse(v.array(StaleRecruitSchema), rawStale);

        logAudit('RESCAN', 'resulted_data', { count: parsedStale.success ? parsedStale.output.length : 0 });
        logAudit('RESCAN', 'integrity_checked', {
            passed: parsedStale.success,
            details: parsedStale.success ? 'Stale target list validated' : 'Unexpected RPC data shape'
        });
        
        if (!parsedStale.success) {
            console.error(`[RESCAN] Stale target list validation failed.`);
            return;
        }

        console.log(`[RESCAN] Validated ${parsedStale.output.length} stale recruits to process.`);

        const rescanTasks = parsedStale.output.map((staleRecruit) => async () => {
            const tag = staleRecruit.player_tag;
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

                const rawPlayerProfile = await res.json();

                // [GUARD] VALIDATION BOUNDARY: Target B [1]
                // THREAT: Malformed player profile during rescan.
                const parsedPlayer = v.safeParse(RoyalePlayerSchema, rawPlayerProfile);

                if (!parsedPlayer.success) {
                    console.error(`[RESCAN] Player ${tag} returned invalid data shape.`);
                    return;
                }

                const playerProfile = parsedPlayer.output;

                // If player has joined a clan, remove them from the recruit pool
                if (playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag)) {
                    await supabase.schema('drivers' as any).from('recruits')
                        .delete()
                        .eq('player_tag', playerProfile.tag);
                    logAudit('RESCAN', 'called', { tag, action: 'purged_clanned' });
                    console.log(`[RESCAN] Player ${tag} joined clan ${playerProfile.clan.tag}. Purged from recruits.`);
                    return;
                }

                // Otherwise refresh their profile data in-place
                const newStatus = (playerProfile.trophies || 0) >= requiredTrophies ? 'ACTIVE' : 'QUEUE';
                await supabase.schema('drivers' as any).from('recruits')
                    .update({
                        trophies: playerProfile.trophies || 0,
                        donations: playerProfile.totalDonations || 0,
                        war_wins: playerProfile.warDayWins || 0,
                        status: newStatus,
                        last_scan: new Date().toISOString()
                    })
                    .eq('player_tag', playerProfile.tag);

                console.log(`[RESCAN] Player ${tag} refreshed. trophies=${playerProfile.trophies}, status=${newStatus}`);
                stats.profiles_scanned++;
                stats.rescans_processed++;
            } catch (rescanException: unknown) {
                const errorMessage = rescanException instanceof Error ? rescanException.message : String(rescanException);
                logAudit('RESCAN', 'error', { tag, message: errorMessage });
                console.error(`[RESCAN] Exception while processing ${tag}: ${errorMessage}`);
            }
        });

        console.log(`[RESCAN] Batch processing ${parsedStale.output.length} rescan tasks...`);
        await processBatch(rescanTasks, 10);
        logAudit('RESCAN', 'terminated', { candidates: parsedStale.output.length, rescanned: stats.rescans_processed });
        console.log(`[RESCAN] Terminated smoothly. Processed ${parsedStale.output.length} candidates, refreshed ${stats.rescans_processed} successfully.`);
    } catch (rescanStageException: unknown) {
        const errorMessage = rescanStageException instanceof Error ? rescanStageException.message : String(rescanStageException);
        stats.errors.push(`Rescan: ${errorMessage}`);
        logAudit('RESCAN', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('RESCAN', 'error', { message: errorMessage });
        logAudit('RESCAN', 'terminated', { error: true });
        console.error(`[RESCAN] Fatal exception: ${errorMessage}`);
    }
}
