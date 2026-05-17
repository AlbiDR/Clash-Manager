// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage 6: Native Deep Depth
 * Synchronizes battle logs for members and high-value recruits.
 */
export async function runDeepDepth(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
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
            const globalShadowLeads = new Map<string, { name: string, trophies: number }>();

            const battleTasks = allTags.map(tag => async () => {
                try {
                    const logRes = await fetchWithRotation(`/players/${encodeURIComponent(tag)}/battlelog`);
                    if (logRes.ok) {
                        const logData = await logRes.json();
                        const isValid = Array.isArray(logData);
                        
                        if (isValid && logData.length > 0) {
                            // Ingest battles
                            const { error: rpcErr } = await supabase.rpc('ingest_player_battles', { 
                                p_tag: tag, 
                                p_payload: logData 
                            });
                            
                            if (rpcErr) {
                                logAudit('S6_BATTLES', 'error', { tag, message: 'RPC Failure', details: rpcErr });
                            }

                            // Extract potential recruits (leads) from opponents
                            logData.forEach((b: any) => {
                                b.opponent?.forEach((op: any) => {
                                    if (op.tag && !op.clan?.tag && op.startingTrophies) {
                                        globalShadowLeads.set(op.tag, { 
                                            name: op.name || 'Unknown Recruit', 
                                            trophies: op.startingTrophies 
                                        });
                                    }
                                });
                            });
                        }
                    } else if (logRes.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('S6_BATTLES', 'called', { tag, action: 'purged_ghost' });
                    }
                } catch (e: any) { 
                    logAudit('S6_BATTLES', 'error', { tag, message: e.message });
                }
            });
            
            // Reduce concurrency to prevent Error 546 (Worker Resource Limit)
            await processBatch(battleTasks, 6);

            // Batch synchronize collected shadow leads
            if (globalShadowLeads.size > 0) {
                const leads = Array.from(globalShadowLeads.entries()).map(([tag, data]) => ({
                    player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                    player_name: data.name,
                    trophies: data.trophies
                }));

                const recruits = leads.map(l => ({
                    ...l,
                    source: 'SHADOW'
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
    } catch (e: any) { 
        results.battles.error = e.message;
        logAudit('S6_BATTLES', 'error', { message: e.message });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw e;
    }
}

