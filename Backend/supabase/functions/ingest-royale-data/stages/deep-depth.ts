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
        const { data: activeRecruits } = await supabase.schema('drivers').from('recruits').select('player_tag').eq('status', 'ACTIVE').limit(50);
        const { data: activeMembers } = await supabase.schema('drivers').from('members').select('player_tag').eq('is_active', true);
        
        const targetPlayerTags = [
            ...(activeMembers?.map(member => member.player_tag) || []),
            ...(activeRecruits?.map(recruit => recruit.player_tag) || [])
        ];

        if (targetPlayerTags.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: targetPlayerTags.length });
            const battleTasks = targetPlayerTags.map(tag => async () => {
                logAudit('S6_BATTLES', 'run', { tag });
                try {
                    const battleLogResponse = await fetchWithRotation(`/players/${encodeURIComponent(tag)}/battlelog`);
                    if (battleLogResponse.ok) {
                        const rawBattleLog = await battleLogResponse.json().catch(() => null);

                        // [GUARD] VALIDATION BOUNDARY: Target B [1]
                        // THREAT: Malformed battle log structures from Royale API Proxy.
                        // Rationale: Ensure granular battle telemetry is hardened before substrate ingestion.
                        const parsedBattleLog = v.safeParse(RoyaleBattleLogSchema, rawBattleLog);

                        const isBattleLogValid = parsedBattleLog.success;
                        logAudit('S6_BATTLES', 'resulted_data', { tag, items: isBattleLogValid ? parsedBattleLog.output.length : 0 });
                        logAudit('S6_BATTLES', 'integrity_checked', { 
                            tag, 
                            passed: isBattleLogValid,
                            details: isBattleLogValid ? 'Data shape validated (Battle Log Array)' : 'Malformed battle log'
                        });
                        
                        if (isBattleLogValid) {
                            const validatedBattleLog = parsedBattleLog.output;
                            const { error: ingestionError } = await supabase.rpc('ingest_player_battles', {
                                p_tag: tag, 
                                p_payload: validatedBattleLog
                            });
                            
                            if (ingestionError) {
                                logAudit('S6_BATTLES', 'error', { tag, message: 'RPC Failure', details: ingestionError });
                            }

                            // [DECISION LOG] Shadow Scouting Discovery
                            // Rationale: Discovers un-clanned opponents from recent battles to feed the recruitment pipeline.
                            const shadowLeadsMap = new Map<string, string>();
                            validatedBattleLog.forEach((battleEntry) => {
                                battleEntry.opponent?.forEach((opponent) => {
                                    if (opponent.tag && !opponent.clan?.tag) {
                                        shadowLeadsMap.set(opponent.tag, opponent.name || 'Unknown Recruit');
                                    }
                                });
                            });

                            if (shadowLeadsMap.size > 0) {
                                const discoveryLeads = Array.from(shadowLeadsMap.entries()).map(([player_tag, player_name]) => ({
                                    player_tag: player_tag.startsWith('#') ? player_tag : `#${player_tag}`,
                                    player_name
                                }));

                                const recruitsPayload = discoveryLeads.map(lead => ({
                                    ...lead,
                                    source: 'SHADOW',
                                    status: 'ACTIVE'
                                }));

                                // L2 Drivers: Sync to universal player registry first to satisfy FK
                                await supabase.schema('drivers').from('players').upsert(discoveryLeads, { onConflict: 'player_tag' });

                                // L2 Drivers: Upsert to shadow recruitment queue
                                const { error: discoveryIngestionError } = await supabase.schema('drivers').from('recruits').upsert(recruitsPayload, { onConflict: 'player_tag' });
                                if (discoveryIngestionError) {
                                    logAudit('S6_BATTLES', 'error', { message: 'Shadow Lead Upsert Failure', details: discoveryIngestionError });
                                }
                            }
                        }
                    } else {
                        if (battleLogResponse.status === 404) {
                            await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                            logAudit('S6_BATTLES', 'called', { tag, action: 'purged_ghost' });
                        }
                        logAudit('S6_BATTLES', 'integrity_checked', { passed: false, details: `HTTP_${battleLogResponse.status}` });
                        logAudit('S6_BATTLES', 'error', { tag, status: battleLogResponse.status });
                    }
                } catch (fetchException: unknown) {
                    const errorMessage = fetchException instanceof Error ? fetchException.message : String(fetchException);
                    logAudit('S6_BATTLES', 'integrity_checked', { passed: false, details: errorMessage });
                    logAudit('S6_BATTLES', 'error', { tag, message: errorMessage });
                }
            });
            
            await processBatch(battleTasks, 20);
        }
        results.battles.success = true;
        logAudit('S6_BATTLES', 'terminated', { tags: targetPlayerTags.length, success: true });
    } catch (deepDepthException: unknown) {
        const errorMessage = deepDepthException instanceof Error ? deepDepthException.message : String(deepDepthException);
        results.battles.error = errorMessage;
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw deepDepthException;
    }
}
