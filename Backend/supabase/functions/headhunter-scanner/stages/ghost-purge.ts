// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import { fetchWithRotation } from "../../_shared/muscle.ts";
import * as v from "npm:valibot";
import { RoyalePlayerSchema } from "../../_shared/schemas.ts";

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
    const { data: targets, error } = await supabase.rpc('get_hot_zone_recruits', { p_limit: 50 });

    if (error) {
        console.error(`[GHOST_PURGE] Failed to fetch hot-zone targets: ${error.message}`);
        logAudit('GHOST_PURGE', 'error', { message: error.message });
        return 0;
    }

    if (!targets || targets.length === 0) {
        console.log(`[GHOST_PURGE] Pool is empty. Nothing to audit.`);
        return 0;
    }

    console.log(`[GHOST_PURGE] Auditing ${targets.length} high-priority recruits...`);

    let ghostsEvicted = 0;
    const touchedTags: string[] = [];

    // --- 2. Batch 10 at a time to respect CoC API rate limits ---
    const BATCH_SIZE = 10;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (targetRecruit: { player_tag: string }) => {
            try {
                const apiResponse = await fetchWithRotation(`/players/${encodeURIComponent(targetRecruit.player_tag)}`);
                if (!apiResponse.ok) {
                    // [DECISION LOG] 404 indicates the player likely no longer exists (tag change/deleted).
                    // Purge immediately to clean the hot-zone.
                    if (apiResponse.status === 404) {
                        await supabase.rpc('purge_recruits', { p_tags: [targetRecruit.player_tag] });
                        ghostsEvicted++;
                    }
                    return;
                }
                const rawPlayerProfile = await apiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: Royale API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes or logic corruption from unexpected Royale API changes.
                const validation = v.safeParse(RoyalePlayerSchema, rawPlayerProfile);

                if (!validation.success) {
                    logAudit('GHOST_PURGE', 'error', { tag: targetRecruit.player_tag, message: 'Player profile validation failed' });
                    return;
                }

                const playerProfile = validation.output;
                stats.profiles_scanned++;

                // [DECISION LOG] If the player has a clan tag and it's not ours (checked via exclusionSet),
                // they are considered a "ghost" in the recruitment view and must be evicted.
                if (playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag)) {
                    // Ghost confirmed: player has joined a clan that isn't ours
                    await supabase.rpc('purge_recruits', { p_tags: [playerProfile.tag] });
                    ghostsEvicted++;
                    logAudit('GHOST_PURGE', 'called', {
                        tag: playerProfile.tag,
                        clan: playerProfile.clan.tag,
                        action: 'evicted_clanned_ghost'
                    });
                    console.log(`[GHOST_PURGE] Evicted ${playerProfile.tag} - joined clan ${playerProfile.clan.tag}`);
                } else {
                    // Player is still clanless - refresh their last_scan timestamp so
                    // the stale-rescan (S4) does not redundantly re-check them this cycle
                    touchedTags.push(playerProfile.tag);
                }
            } catch (auditError: unknown) {
                const errorMessage = auditError instanceof Error ? auditError.message : String(auditError);
                console.warn(`[GHOST_PURGE] Could not audit ${targetRecruit.player_tag}: ${errorMessage}`);
                stats.errors.push(`GHOST_PURGE:${targetRecruit.player_tag}: ${errorMessage}`);
            }
        }));
    }

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
