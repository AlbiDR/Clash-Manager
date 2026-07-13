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
 * Returns the number of ghosts evicted.
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
                    await supabase.rpc('purge_recruits', { p_tags: [recruitCandidate.player_tag] });
                    ghostsEvicted++;
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
                await supabase.rpc('purge_recruits', { p_tags: [playerProfileSnapshot.tag] });
                ghostsEvicted++;
                logAudit('GHOST_PURGE', 'called', {
                    tag: playerProfileSnapshot.tag,
                    clan: playerProfileSnapshot.clan.tag,
                    action: 'evicted_clanned_ghost'
                });
                console.log(`[GHOST_PURGE] Evicted ${playerProfileSnapshot.tag} - joined clan ${playerProfileSnapshot.clan.tag}`);
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
    if (touchedTags.length > 0) {
        const { error: touchErr } = await supabase.rpc('touch_recruits', { p_tags: touchedTags });
        if (touchErr) {
            console.warn(`[GHOST_PURGE] touch_recruits failed: ${touchErr.message}`);
        }
    }

    console.log(`[GHOST_PURGE] Audit complete - ${ghostsEvicted} ghost(s) evicted, ${touchedTags.length} recruit(s) refreshed.`);
    logAudit('GHOST_PURGE', 'resulted_data', {
        evicted: ghostsEvicted,
        refreshed: touchedTags.length,
        audited: targets.length
    });

    return ghostsEvicted;
}
