// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import * as v from "npm:valibot@1.4.2";
import { RoyalePlayerSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

/**
 * S0: Ghost Purge (Hot-Zone Audit)
 * Aggressively audits the Top 50 ACTIVE recruits to ensure the headhunter view
 * stays free of players who have since joined a clan. Any clanned player in the
 * top 50 is wasting a visible slot - purge first, discover second.
 *
 * @remarks
 * This function handles the Layer 1 core Deno edge function execution for the Ghost Purge stage.
 * It fetches high-priority active recruits from the hot-zone, performs batched checks via the Royale API,
 * validates profiles against schemas, and evicts clanned players using the `purge_recruits` RPC procedure.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core / Kernel (`@core`)
 * - **Satisfaction:** Satisfies ADR Section IV: Deep Delegation Strategy by executing automated scouter
 *   audit logic in the serverless edge environment rather than local user devices.
 * - **Validation:** Satisfies ADR Section III: Validation Boundaries by enforcing rigid schema checks
 *   (using Valibot) on both database query results and external Royale API player records.
 * - **Data Lifecycle:** Satisfies ADR Section XI: Data Lifecycle Management (Smart Pruning) by actively
 *   purging stale clanned targets from active recruitment indexes.
 *
 * @param exclusionSet - Set of player tags that are excluded from scouter audits (e.g., family clan members).
 * @param stats - Transitive statistics accumulator for logging scanner metrics.
 * @param logAudit - Auditing delegate callback for recording stage step history.
 *
 * @returns A promise resolving to the number of clanned ghost players successfully evicted from the hot-zone.
 *
 * @throws Never throws directly; captures and logs operational database or batch errors into `stats.errors`.
 *
 * @sideeffects
 * - Updates metrics in `stats` (e.g., profiles_scanned).
 * - Modifies the database by invoking Supabase RPCs (`purge_recruits`, `touch_recruits`).
 * - Dispatches concurrent network requests to the external Royale API server.
 */
export async function runGhostPurge(
    exclusionSet: Set<string>,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<number> {
    console.log(`[GHOST_PURGE] Starting hot-zone audit of top 50 active recruits...`);

    // --- 1. Pull the top 50 active recruits by RPoS ---
    const { data: hotZoneTargetsRaw, error: hotZoneTargetsError } = await supabase.rpc('get_hot_zone_recruits', { p_limit: 50 });

    if (hotZoneTargetsError) {
        console.error(`[GHOST_PURGE] Failed to fetch hot-zone targets: ${hotZoneTargetsError.message}`);
        logAudit('GHOST_PURGE', 'error', { message: hotZoneTargetsError.message });
        return 0;
    }

    // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
    // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists.
    // [DECISION LOG] Explicitly validating the shape of hotZoneTargetsRaw before processing.
    const hotZoneTargetsIntegrity = v.safeParse(v.array(StaleRecruitSchema), hotZoneTargetsRaw ?? []);

    logAudit('GHOST_PURGE', 'integrity_checked', {
        stage: 'TARGET_FETCH',
        passed: hotZoneTargetsIntegrity.success,
        details: hotZoneTargetsIntegrity.success ? 'Hot-zone targets validated' : 'Malformed hot-zone targets payload'
    });

    if (!hotZoneTargetsIntegrity.success || hotZoneTargetsIntegrity.output.length === 0) {
        console.log(`[GHOST_PURGE] Pool is empty or malformed. Nothing to audit.`);
        return 0;
    }

    const targets = hotZoneTargetsIntegrity.output;
    console.log(`[GHOST_PURGE] Auditing ${targets.length} high-priority recruits...`);

    let ghostsEvicted = 0;
    const touchedTags: string[] = [];

    // --- 2. Batch processing to respect CoC API rate limits and Edge Function resource limits ---
    // [DECISION LOG] Refactored to use processBatch for consistent concurrency orchestration.
    // [THREAT:] Prevents Error 546 (Worker Resource Limit) by capping active fetch tasks.
    const purgeTasks = targets.map((recruitCandidate) => async () => {
        try {
            const playerProfileResponse = await fetchWithRotation(`/players/${encodeURIComponent(recruitCandidate.player_tag)}`);
            if (!playerProfileResponse.ok) {
                // [DECISION LOG] 404 indicates the player likely no longer exists (tag change/deleted).
                // Purge immediately to clean the hot-zone.
                if (playerProfileResponse.status === 404) {
                    // [THREAT:] supabase.rpc() resolves with { error } instead of throwing, so an
                    // unchecked call would advance ghostsEvicted for an eviction that never happened
                    // and stats.ghosts_purged would report phantom purges.
                    // [DECISION LOG] The counter only advances once the write is confirmed.
                    const { error: deadRecruitPurgeError } = await supabase.rpc('purge_recruits', { p_tags: [recruitCandidate.player_tag] });
                    if (deadRecruitPurgeError) {
                        console.error(`[GHOST_PURGE] Failed to purge dead recruit ${recruitCandidate.player_tag}: ${deadRecruitPurgeError.message}`);
                        stats.errors.push(`GHOST_PURGE:${recruitCandidate.player_tag}: ${deadRecruitPurgeError.message}`);
                        logAudit('GHOST_PURGE', 'error', { tag: recruitCandidate.player_tag, message: 'Failed to purge dead recruit', details: deadRecruitPurgeError });
                    } else {
                        ghostsEvicted++;
                    }
                }
                return;
            }

            // [GUARD] VALIDATION BOUNDARY: Royale API data must match our internal schema.
            // [THREAT:] External API data is un-trusted. Replacing implicit 'any' with 'unknown'
            // to enforce strict narrowing and prevent runtime crashes or logic corruption
            // from unexpected Royale API changes.
            const playerProfileRaw: unknown = await playerProfileResponse.json();
            const playerProfileIntegrity = v.safeParse(RoyalePlayerSchema, playerProfileRaw);

            if (!playerProfileIntegrity.success) {
                logAudit('GHOST_PURGE', 'error', { tag: recruitCandidate.player_tag, message: 'Player profile validation failed' });
                return;
            }

            const playerProfileSnapshot = playerProfileIntegrity.output;
            stats.profiles_scanned++;

            // [DECISION LOG] If the player has a clan tag and it's not ours (checked via exclusionSet),
            // they are considered a "ghost" in the recruitment view and must be evicted.
            if (playerProfileSnapshot.clan?.tag && !exclusionSet.has(playerProfileSnapshot.tag)) {
                // Ghost confirmed: player has joined a clan that isn't ours
                // [THREAT:] A silently failed purge leaves the clanned player holding a top-50 slot
                // forever while stats.ghosts_purged claims an eviction that never landed.
                // [DECISION LOG] The counter and the 'evicted_clanned_ghost' audit entry are both
                // gated on RPC success. On failure the tag is deliberately NOT added to touchedTags,
                // so its last_scan stays stale and the S4 rescan retries the eviction next cycle.
                const { error: clannedGhostPurgeError } = await supabase.rpc('purge_recruits', { p_tags: [playerProfileSnapshot.tag] });
                if (clannedGhostPurgeError) {
                    console.error(`[GHOST_PURGE] Failed to evict clanned ghost ${playerProfileSnapshot.tag}: ${clannedGhostPurgeError.message}`);
                    stats.errors.push(`GHOST_PURGE:${playerProfileSnapshot.tag}: ${clannedGhostPurgeError.message}`);
                    logAudit('GHOST_PURGE', 'error', { tag: playerProfileSnapshot.tag, message: 'Failed to evict clanned ghost', details: clannedGhostPurgeError });
                } else {
                    ghostsEvicted++;
                    logAudit('GHOST_PURGE', 'called', {
                        tag: playerProfileSnapshot.tag,
                        clan: playerProfileSnapshot.clan.tag,
                        action: 'evicted_clanned_ghost'
                    });
                    console.log(`[GHOST_PURGE] Evicted ${playerProfileSnapshot.tag} - joined clan ${playerProfileSnapshot.clan.tag}`);
                }
            } else {
                // Player is still clanless - refresh their last_scan timestamp so
                // the stale-rescan (S4) does not redundantly re-check them this cycle
                touchedTags.push(playerProfileSnapshot.tag);
            }
        } catch (ghostPurgeExecutionError: unknown) {
            const errorMessage = ghostPurgeExecutionError instanceof Error ? ghostPurgeExecutionError.message : String(ghostPurgeExecutionError);
            console.warn(`[GHOST_PURGE] Could not audit ${recruitCandidate.player_tag}: ${errorMessage}`);
            stats.errors.push(`GHOST_PURGE:${recruitCandidate.player_tag}: ${errorMessage}`);
        }
    });

    await processBatch(purgeTasks, 10);

    // --- 3. Bulk-touch all verified clanless recruits in one RPC call ---
    // [DECISION LOG] `refreshed` reports confirmed last_scan writes, not attempted ones, so a
    // failed touch_recruits cannot inflate the audit trail with refreshes that never landed.
    let recruitsRefreshed = 0;
    if (touchedTags.length > 0) {
        const { error: touchErr } = await supabase.rpc('touch_recruits', { p_tags: touchedTags });
        if (touchErr) {
            console.warn(`[GHOST_PURGE] touch_recruits failed: ${touchErr.message}`);
            stats.errors.push(`GHOST_PURGE:touch_recruits: ${touchErr.message}`);
            logAudit('GHOST_PURGE', 'error', { message: 'touch_recruits failed', details: touchErr });
        } else {
            recruitsRefreshed = touchedTags.length;
        }
    }

    console.log(`[GHOST_PURGE] Audit complete - ${ghostsEvicted} ghost(s) evicted, ${recruitsRefreshed} recruit(s) refreshed.`);
    logAudit('GHOST_PURGE', 'resulted_data', {
        evicted: ghostsEvicted,
        refreshed: recruitsRefreshed,
        audited: targets.length
    });

    return ghostsEvicted;
}
