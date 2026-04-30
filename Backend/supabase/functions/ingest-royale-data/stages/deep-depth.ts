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
        const { data: hvt } = await supabase.schema('drivers').from('recruits').select('player_tag').eq('status', 'ACTIVE').limit(50);
        const { data: members } = await supabase.schema('drivers').from('members').select('player_tag').eq('is_active', true);
        
        const allTags = [
            ...(members?.map(m => m.player_tag) || []),
            ...(hvt?.map(h => h.player_tag) || [])
        ];

        if (allTags.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: allTags.length });
            const battleTasks = allTags.map(tag => async () => {
                logAudit('S6_BATTLES', 'run', { tag });
                try {
                    const logRes = await fetchWithRotation(`/players/${encodeURIComponent(tag)}/battlelog`);
                    if (logRes.ok) {
                        const logData = await logRes.json();
                        const isValid = Array.isArray(logData);
                        logAudit('S6_BATTLES', 'resulted_data', { tag, items: logData.length });
                        logAudit('S6_BATTLES', 'integrity_checked', { 
                            tag, 
                            passed: isValid, 
                            details: isValid ? 'Data shape validated (Array)' : 'Malformed battle log' 
                        });
                        
                        if (isValid) {
                            const { error: rpcErr } = await supabase.rpc('ingest_player_battles', { 
                                p_tag: tag, 
                                p_payload: logData 
                            });
                            
                            if (rpcErr) {
                                logAudit('S6_BATTLES', 'error', { tag, message: 'RPC Failure', details: rpcErr });
                            }

                            const opponentTags = new Set<string>();
                            logData.forEach((b: any) => b.opponent?.forEach((op: any) => op.tag && !op.clan?.tag && opponentTags.add(op.tag)));
                            if (opponentTags.size > 0) {
                                await supabase.schema('drivers').from('recruits').upsert(
                                    Array.from(opponentTags).sort().map(t => ({ player_tag: t, status: 'ACTIVE' })), 
                                    { onConflict: 'player_tag' }
                                );
                            }
                        }
                    } else {
                        if (logRes.status === 404) {
                            await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                            logAudit('S6_BATTLES', 'called', { tag, action: 'purged_ghost' });
                        }
                        logAudit('S6_BATTLES', 'integrity_checked', { passed: false, details: `HTTP_${logRes.status}` });
                        logAudit('S6_BATTLES', 'error', { tag, status: logRes.status });
                    }
                } catch (e: any) { 
                    logAudit('S6_BATTLES', 'integrity_checked', { passed: false, details: e.message });
                    logAudit('S6_BATTLES', 'error', { tag, message: e.message });
                }
            });
            
            await processBatch(battleTasks, 20);
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
