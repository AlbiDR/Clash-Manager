// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleBattleLogSchema, IngestionTargetsSchema } from "../../_shared/schemas.ts";

/**
 * Stage 6: Native Deep Depth
 * Synchronizes battle logs for members and high-value recruits.
 *
 * @remarks
 * **Polling interval rationale (30 minutes):**
 * The Clash Royale battle log API returns a rolling window of at most 25 battles.
 * A 30-minute cron interval means a player would need to complete all 25 battles
 * in under 30 minutes, requiring each battle to end in 72 seconds or less.
 * Given that the realistic minimum duration of a Clash Royale battle is roughly
 * 1.5 to 2 minutes, a player can complete at most 15-20 battles in this window,
 * keeping queue consumption well within the 25-battle buffer.
 * Shortening the interval further adds API call overhead without meaningfully
 * improving battle capture accuracy.
 */
export async function runDeepDepth(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('S6_BATTLES', 'triggered');
    try {
        const { data: rawTargets, error: targetsError } = await supabase.rpc('get_ingestion_targets');

        // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
        // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists.
        const targetsValidation = v.safeParse(IngestionTargetsSchema, rawTargets ?? {});
        
        logAudit('S6_BATTLES', 'integrity_checked', {
            stage: 'TARGET_FETCH',
            passed: targetsValidation.success && !targetsError,
            details: targetsError ? targetsError.message : (targetsValidation.success ? 'Targets validated' : 'Malformed targets payload')
        });

        if (!targetsValidation.success || targetsError) {
            throw new Error(`Failed to fetch ingestion targets: ${targetsError?.message || 'Validation failed'}`);
        }

        const targets = targetsValidation.output;
        const ingestionTargets = [
            ...targets.members,
            ...targets.recruits
        ];

        if (ingestionTargets.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: ingestionTargets.length });
            
            // Shared map to collect shadow leads across all concurrent tasks
            // EPHEMERAL: intentionally resets on cold start
            // [DECISION LOG] Using Map<string, { name: string }> to fix type mismatch pathogen.
            const globalShadowLeads = new Map<string, { name: string }>();

            const battleTasks = ingestionTargets.map(targetTag => async () => {
                try {
                    const battleLogResponse = await fetchWithRotation(`/players/${encodeURIComponent(targetTag)}/battlelog`);
                    if (battleLogResponse.ok) {
                        const rawBattleLogPayload: unknown = await battleLogResponse.json();
                        
                        // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                        // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes in battle logs.
                        const validation = v.safeParse(RoyaleBattleLogSchema, rawBattleLogPayload);

                        logAudit('S6_BATTLES', 'integrity_checked', {
                            tag: targetTag,
                            passed: validation.success,
                            details: validation.success ? 'Battle log validated via Valibot' : 'Malformed battle log payload'
                        });

                        if (validation.success && validation.output.length > 0) {
                            const battleLog = validation.output;
                            // Ingest battles
                            const { error: rpcErr } = await supabase.rpc('ingest_player_battles', { 
                                p_tag: targetTag,
                                p_payload: battleLog
                            });
                            
                            if (rpcErr) {
                                logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'RPC Failure', details: rpcErr });
                            }

                            // Extract potential recruits (leads) from opponents
                            // [DECISION LOG] We harvest "Shadow Leads" from the battle history of existing players.
                            battleLog.forEach((battle) => {
                                battle.opponent?.forEach((opponent) => {
                                    if (opponent.tag && !opponent.clan?.tag) {
                                        globalShadowLeads.set(opponent.tag, { name: opponent.name || 'Unknown Recruit' });
                                    }
                                });
                            });
                        }
                    } else if (battleLogResponse.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: targetTag });
                        logAudit('S6_BATTLES', 'called', { tag: targetTag, action: 'purged_ghost' });
                    }
                } catch (battleLogError: unknown) {
                    const errorMessage = battleLogError instanceof Error ? battleLogError.message : String(battleLogError);
                    logAudit('S6_BATTLES', 'error', { tag: targetTag, message: errorMessage });
                }
            });
            
            // Reduce concurrency to prevent Error 546 (Worker Resource Limit)
            // [DECISION LOG] Concurrency 6 is chosen to balance throughput and resource exhaustion on Supabase Edge.
            await processBatch(battleTasks, 6);

            // Batch synchronize collected shadow leads
            if (globalShadowLeads.size > 0) {
                // [THREAT:] Standardizing leads payload to prevent 'undefined' pathogens in ingestion.
                const validLeads = Array.from(globalShadowLeads.entries()).map(([tag, data]) => ({
                    player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                    player_name: data.name,
                    trophies: 0 // Battle logs do not provide ladder metrics.
                }));

                const recruits = validLeads.map(lead => ({
                    ...lead,
                    source: 'SHADOW',
                    status: 'ACTIVE'
                }));

                // L2 Drivers: Sync to universal player registry first
                await supabase.rpc('sync_players', { p_players: validLeads });

                // L2 Drivers: Upsert to shadow recruitment queue
                const { error: leadErr } = await supabase.rpc('sync_recruits', { p_recruits: recruits });
                if (leadErr) {
                    logAudit('S6_BATTLES', 'error', { message: 'Shadow Lead Batch Upsert Failure', details: leadErr });
                }
            }
        }
        results.battles.success = true;
        logAudit('S6_BATTLES', 'terminated', { tags: ingestionTargets.length, success: true });
    } catch (battleLogError: unknown) {
        const errorMessage = battleLogError instanceof Error ? battleLogError.message : String(battleLogError);
        results.battles.error = errorMessage;
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw battleLogError;
    }
}
