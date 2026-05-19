// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import { RoyalePlayerSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

interface SyncRecruitRow {
    player_tag: string;
    player_name: string;
    trophies: number;
    donations: number;
    cards: number;
    war_wins: number;
    raw_potential_score: number;
    source: string;
    status: 'ACTIVE' | 'QUEUE';
}

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
        const { data: rawStale, error: rpcError } = await supabase
            .rpc('get_stale_recruits', { p_limit: 250 });

        logAudit('RESCAN', 'run', { count: Array.isArray(rawStale) ? rawStale.length : 0, error: rpcError?.message });

        if (rpcError || !rawStale || (Array.isArray(rawStale) && rawStale.length === 0)) {
            if (rpcError) {
                logAudit('RESCAN', 'integrity_checked', { passed: false, details: rpcError.message });
                console.error(`[RESCAN] RPC error: ${rpcError.message}`);
            } else {
                console.log(`[RESCAN] No stale targets found to rescan.`);
            }
            logAudit('RESCAN', 'terminated', { reason: 'no_stale_targets' });
            return;
        }

        // [GUARD] VALIDATION BOUNDARY: RPC Response
        // [THREAT:] Malformed database view or RPC return could cause runtime errors in the loop.
        const staleValidation = v.safeParse(v.array(StaleRecruitSchema), rawStale);

        logAudit('RESCAN', 'resulted_data', { count: staleValidation.success ? staleValidation.output.length : 0 });
        logAudit('RESCAN', 'integrity_checked', {
            passed: staleValidation.success,
            details: staleValidation.success ? 'Stale target list validated (Array<StaleRecruitSchema>)' : 'Unexpected data shape from get_stale_recruits'
        });

        if (!staleValidation.success) {
            logAudit('RESCAN', 'terminated', { error: 'Validation failed' });
            return;
        }

        const staleRecruits = staleValidation.output;
        console.log(`[RESCAN] Validated ${staleRecruits.length} stale recruits to process.`);

        const validRescans: SyncRecruitRow[] = [];
        const rescanTasks = staleRecruits.map((recruitRow) => async () => {
            const tag = recruitRow.player_tag;
            try {
                const apiResponse = await fetchWithRotation(`/players/${encodeURIComponent(tag)}`);
                if (!apiResponse.ok) {
                    if (apiResponse.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('RESCAN', 'called', { tag, action: 'purged_ghost' });
                        console.log(`[RESCAN] Player ${tag} is a ghost (404). Purged.`);
                    } else {
                        logAudit('RESCAN', 'error', { tag, status: apiResponse.status });
                        console.error(`[RESCAN] Player ${tag} fetch failed with HTTP ${apiResponse.status}`);
                    }
                    return;
                }

                const rawProfile: unknown = await apiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data
                // [THREAT:] External Royale API data is un-trusted. Every ingress point is guarded by Valibot schemas.
                const profileValidation = v.safeParse(RoyalePlayerSchema, rawProfile);

                if (!profileValidation.success) {
                    logAudit('RESCAN', 'error', { tag, message: 'Invalid player profile shape', issues: profileValidation.issues });
                    console.error(`[RESCAN] Player ${tag} returned invalid data shape.`);
                    return;
                }

                const playerProfile = profileValidation.output;

                // [DECISION LOG] If player has joined a clan, remove them from the recruit pool.
                // We only care about clanless players or players in our exclusion set (our own clan/family).
                if (playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag)) {
                    await supabase.rpc('purge_recruits', { p_tags: [playerProfile.tag] });
                    logAudit('RESCAN', 'called', { tag, action: 'purged_clanned' });
                    console.log(`[RESCAN] Player ${tag} joined clan ${playerProfile.clan.tag}. Purged from recruits.`);
                    return;
                }

                // Authoritative formula: Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
                // [DECISION LOG] Metrics are weighted to prioritize active war participants and high trophies.
                const rawScore = (playerProfile.trophies * 1.0) + (playerProfile.totalDonations * 0.1) + ((playerProfile.warDayWins + 500) * 20.0);

                // Otherwise prepare their profile data for batch refresh
                validRescans.push({
                    player_tag: playerProfile.tag,
                    player_name: playerProfile.name,
                    trophies: playerProfile.trophies,
                    donations: playerProfile.totalDonations,
                    cards: playerProfile.challengeCardsWon,
                    war_wins: playerProfile.warDayWins,
                    raw_potential_score: rawScore,
                    source: 'TOURNAMENT', // Fallback
                    status: playerProfile.trophies >= requiredTrophies ? 'ACTIVE' : 'QUEUE'
                });

                console.log(`[RESCAN] Player ${tag} prepared for refresh. trophies=${playerProfile.trophies}`);
                stats.profiles_scanned++;
            } catch (rescanError: unknown) {
                const errorMessage = rescanError instanceof Error ? rescanError.message : String(rescanError);
                logAudit('RESCAN', 'error', { tag, message: errorMessage });
                console.error(`[RESCAN] Exception while processing ${tag}: ${errorMessage}`);
            }
        });

        console.log(`[RESCAN] Batch processing ${staleRecruits.length} rescan tasks...`);
        await processBatch(rescanTasks, 10);

        if (validRescans.length > 0) {
            console.log(`[RESCAN] Synchronizing ${validRescans.length} refreshed profiles via RPC...`);
            const { error: syncError } = await supabase.rpc('sync_recruits', { p_recruits: validRescans });
            if (syncError) {
                console.error(`[RESCAN] Sync failure: ${syncError.message}`);
                logAudit('RESCAN', 'error', { message: 'Batch sync failed', details: syncError });
            } else {
                stats.rescans_processed = validRescans.length;
                stats.refreshed_recruits = (stats.refreshed_recruits || 0) + validRescans.length;
                console.log(`[RESCAN] Successfully synchronized ${validRescans.length} profiles.`);
            }
        }
        logAudit('RESCAN', 'terminated', { candidates: staleRecruits.length, rescanned: stats.rescans_processed });
        console.log(`[RESCAN] Terminated smoothly. Processed ${staleRecruits.length} candidates, refreshed ${stats.rescans_processed} successfully.`);
    } catch (rescanError: unknown) {
        const errorMessage = rescanError instanceof Error ? rescanError.message : String(rescanError);
        stats.errors.push(`Rescan: ${errorMessage}`);
        logAudit('RESCAN', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('RESCAN', 'error', { message: errorMessage });
        logAudit('RESCAN', 'terminated', { error: true });
        console.error(`[RESCAN] Fatal exception: ${errorMessage}`);
    }
}
