// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.4.2";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry, RecruitSyncRow } from "../../_shared/types.ts";
import { calculateRpos } from "../../_shared/utils.ts";
import { RESCAN_BATCH_LIMIT, CONCURRENCY_RESCAN } from "../../_shared/config.ts";
import { RoyalePlayerSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

/**
 * Stage: Stale Recruit Re-scan
 * Re-profiles ACTIVE recruits not scanned in the last 48 hours to keep
 * trophy counts, donation stats, and clan status fresh. Automatically
 * removes candidates who have since joined a clan (no longer valid targets).
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 4 (@app / Edge Function Stage)
 * - **Import Boundaries:** Consumes `@shared` schemas and utilities. Forbidden from importing `@core` (PWA-only).
 * - **Satisfies ADR Section III:** Validation Boundaries (via Valibot schemas).
 * - **Satisfies ADR Section IV:** Resilience & Operational Security (via `processBatch` throttling).
 *
 * **Logic Intent:**
 * This stage prevents recruitment of players who are already in a clan or
 * whose trophy counts no longer meet the current recruitment standards.
 *
 * **Permissions:**
 * Requires `service_role` or specific RLS bypass to execute RPCs:
 * - `get_stale_recruits`
 * - `report_dead_recruit`
 * - `purge_recruits`
 * - `sync_recruits`
 *
 * @param exclusionSet - Set of player tags (e.g., family clan members) to ignore.
 * @param requiredTrophies - Minimum trophies required for 'ACTIVE' status.
 * @param stats - Shared scanner statistics for tracking throughput.
 * @param logAudit - Function to record execution milestones in the audit log.
 *
 * @sideeffects
 * - **Network:** Fetches player data from the Royale API via `fetchWithRotation`.
 * - **Database (RPC):** `get_stale_recruits`: Retrieves candidates for re-scanning.
 * - **Database (RPC):** `report_dead_recruit`: Removes 404 targets from the database.
 * - **Database (RPC):** `purge_recruits`: Evicts targets who have joined other clans.
 * - **Database (RPC):** `sync_recruits`: Synchronizes refreshed profile data.
 *
 * @throws Never - Catch-all block ensures stage completion and error logging.
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
        // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
        // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists in the recruits table.
        // [DECISION LOG] Explicitly fetching and validating the shape of rawStaleRecruits before processing.
        const { data: rawStaleRecruits, error: rpcError } = await supabase
            .rpc('get_stale_recruits', { p_limit: RESCAN_BATCH_LIMIT });

        logAudit('RESCAN', 'run', { count: Array.isArray(rawStaleRecruits) ? rawStaleRecruits.length : 0, error: rpcError?.message });

        if (rpcError || !rawStaleRecruits || (Array.isArray(rawStaleRecruits) && rawStaleRecruits.length === 0)) {
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
        const staleValidation = v.safeParse(v.array(StaleRecruitSchema), rawStaleRecruits);

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

        const refreshedRecruitBatch: RecruitSyncRow[] = [];
        const rescanProcessingQueue = staleRecruits.map((staleRecruitSnapshot) => async () => {
            const targetPlayerTag = staleRecruitSnapshot.player_tag;
            try {
                const royaleApiResponse = await fetchWithRotation(`/players/${encodeURIComponent(targetPlayerTag)}`);
                if (!royaleApiResponse.ok) {
                    if (royaleApiResponse.status === 404) {
                        // [THREAT:] Silent RPC failures can leave "ghost" recruits in the database.
                        // [DECISION LOG] Capturing and logging RPC error to ensure visibility of purge failures.
                        const { error: deadRecruitError } = await supabase.rpc('report_dead_recruit', { p_player_tag: targetPlayerTag });
                        if (deadRecruitError) {
                            logAudit('RESCAN', 'error', { tag: targetPlayerTag, message: 'Failed to report dead recruit', details: deadRecruitError });
                        }
                        logAudit('RESCAN', 'called', { tag: targetPlayerTag, action: 'purged_ghost' });
                        console.log(`[RESCAN] Player ${targetPlayerTag} is a ghost (404). Purged.`);
                    } else {
                        logAudit('RESCAN', 'error', { tag: targetPlayerTag, status: royaleApiResponse.status });
                        console.error(`[RESCAN] Player ${targetPlayerTag} fetch failed with HTTP ${royaleApiResponse.status}`);
                    }
                    return;
                }

                const rawRoyaleProfile: unknown = await royaleApiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data
                // [THREAT:] External Royale API data is un-trusted. Every ingress point is guarded by Valibot schemas.
                const profileValidation = v.safeParse(RoyalePlayerSchema, rawRoyaleProfile);

                if (!profileValidation.success) {
                    logAudit('RESCAN', 'error', { tag: targetPlayerTag, message: 'Invalid player profile shape', issues: profileValidation.issues });
                    console.error(`[RESCAN] Player ${targetPlayerTag} returned invalid data shape.`);
                    return;
                }

                const playerProfile = profileValidation.output;

                // [DECISION LOG] If player has joined a clan, remove them from the recruit pool.
                // We only care about clanless players or players in our exclusion set (our own clan/family).
                if (playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag)) {
                    // [THREAT:] Silent RPC failures can leave clanned players in the recruitment pool.
                    // [DECISION LOG] Capturing and logging RPC error for purge accountability.
                    const { error: purgeError } = await supabase.rpc('purge_recruits', { p_tags: [playerProfile.tag] });
                    if (purgeError) {
                        logAudit('RESCAN', 'error', { tag: playerProfile.tag, message: 'Failed to purge clanned recruit', details: purgeError });
                    }
                    logAudit('RESCAN', 'called', { tag: playerProfile.tag, action: 'purged_clanned' });
                    console.log(`[RESCAN] Player ${playerProfile.tag} joined clan ${playerProfile.clan.tag}. Purged from recruits.`);
                    return;
                }

                // [DECISION LOG] RPoS (Raw Potential Score) CALCULATION:
                // Refactored to use centralized L1 Core utility to ensure formula consistency.
                const rawScore = calculateRpos(playerProfile.trophies, playerProfile.totalDonations, playerProfile.warDayWins);

                // Otherwise prepare their profile data for batch refresh
                refreshedRecruitBatch.push({
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

                console.log(`[RESCAN] Player ${targetPlayerTag} prepared for refresh. trophies=${playerProfile.trophies}`);
                stats.profiles_scanned++;
            } catch (rescanError: unknown) {
                const errorMessage = rescanError instanceof Error ? rescanError.message : String(rescanError);
                logAudit('RESCAN', 'error', { tag: targetPlayerTag, message: errorMessage });
                console.error(`[RESCAN] Exception while processing ${targetPlayerTag}: ${errorMessage}`);
            }
        });

        console.log(`[RESCAN] Batch processing ${staleRecruits.length} rescan tasks...`);
        await processBatch(rescanProcessingQueue, CONCURRENCY_RESCAN);

        if (refreshedRecruitBatch.length > 0) {
            console.log(`[RESCAN] Synchronizing ${refreshedRecruitBatch.length} refreshed profiles via RPC...`);
            // [THREAT:] Silent RPC failures during bulk sync could lead to stale data persisting despite successful API fetches.
            // [DECISION LOG] Capturing and logging sync errors for operational transparency.
            const { error: syncError } = await supabase.rpc('sync_recruits', { p_recruits: refreshedRecruitBatch });
            if (syncError) {
                console.error(`[RESCAN] Sync failure: ${syncError.message}`);
                logAudit('RESCAN', 'error', { message: 'Batch sync failed', details: syncError });
            } else {
                stats.rescans_processed = refreshedRecruitBatch.length;
                stats.refreshed_recruits = (stats.refreshed_recruits || 0) + refreshedRecruitBatch.length;
                console.log(`[RESCAN] Successfully synchronized ${refreshedRecruitBatch.length} profiles.`);
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
