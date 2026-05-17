// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleBattleLogSchema } from "../../_shared/schemas.ts";

/**
 * Stage 6: Native Deep Depth
 * Synchronizes battle logs for members and high-value recruits.
 */
export async function runDeepDepth(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('S6_BATTLES', 'triggered');
    try {
        const { data: targets } = await supabase.rpc('get_ingestion_targets');
        
        const allTags = [
            ...(targets?.members || []),
            ...(targets?.recruits || [])
        ];

        if (allTags.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: allTags.length });
            
            // Shared map to collect shadow leads across all concurrent tasks
            // EPHEMERAL: intentionally resets on cold start
            const globalShadowLeads = new Map<string, string>();

            const battleTasks = allTags.map(tag => async () => {
                try {
                    const logRes = await fetchWithRotation(`/players/${encodeURIComponent(tag)}/battlelog`);
                    if (logRes.ok) {
                        const rawLogData: unknown = await logRes.json();
                        
                        // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                        // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes in battle logs.
                        const validation = v.safeParse(RoyaleBattleLogSchema, rawLogData);

                        logAudit('S6_BATTLES', 'integrity_checked', {
                            tag,
                            passed: validation.success,
                            details: validation.success ? 'Battle log validated via Valibot' : 'Malformed battle log payload'
                        });

                        if (validation.success && validation.output.length > 0) {
                            const battleLog = validation.output;
                            // Ingest battles
                            const { error: rpcErr } = await supabase.rpc('ingest_player_battles', { 
                                p_tag: tag, 
                                p_payload: battleLog
                            });
                            
                            if (rpcErr) {
                                logAudit('S6_BATTLES', 'error', { tag, message: 'RPC Failure', details: rpcErr });
                            }

                            // Extract potential recruits (leads) from opponents
                            // [DECISION LOG] We harvest "Shadow Leads" from the battle history of existing players.
                            battleLog.forEach((battle) => {
                                battle.opponent?.forEach((opponent) => {
                                    if (opponent.tag && !opponent.clan?.tag) {
                                        globalShadowLeads.set(opponent.tag, opponent.name || 'Unknown Recruit');
                                    }
                                });
                            });
                        }
                    } else if (logRes.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('S6_BATTLES', 'called', { tag, action: 'purged_ghost' });
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    logAudit('S6_BATTLES', 'error', { tag, message: errorMessage });
                }
            });
            
            // Reduce concurrency to prevent Error 546 (Worker Resource Limit)
            // [DECISION LOG] Concurrency 6 is chosen to balance throughput and resource exhaustion on Supabase Edge.
            await processBatch(battleTasks, 6);

            // Batch synchronize collected shadow leads
            if (globalShadowLeads.size > 0) {
                const leads = Array.from(globalShadowLeads.entries()).map(([tag, name]) => ({
                    player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                    player_name: name
                }));

                const recruits = leads.map(lead => ({
                    ...lead,
                    source: 'SHADOW',
                    status: 'ACTIVE'
                }));

                // L2 Drivers: Sync to universal player registry first
                await supabase.rpc('sync_players', { p_players: leads });

                // L2 Drivers: Upsert to shadow recruitment queue
                const { error: leadErr } = await supabase.rpc('sync_recruits', { p_recruits: recruits });
                if (leadErr) {
                    logAudit('S6_BATTLES', 'error', { message: 'Shadow Lead Batch Upsert Failure', details: leadErr });
                }
            }
        }
        results.battles.success = true;
        logAudit('S6_BATTLES', 'terminated', { tags: allTags.length, success: true });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.battles.error = errorMessage;
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw error;
    }
}
