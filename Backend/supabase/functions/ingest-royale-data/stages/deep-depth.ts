// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { normalizeTag } from "../../_shared/utils.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot@1.4.2";
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

        const targetsSnapshot = targetsValidation.output;

        // [THREAT:] Accessing non-existent properties 'drivers.members'/'drivers.recruits' on
        // the validated targetsSnapshot would lead to a runtime crash when spreading undefined.
        // [DECISION LOG] Corrected property access to 'members' and 'recruits' to match
        // the IngestionTargetsSchema contract defined in Layer 1 (rpcSchemas.ts).
        const ingestionTargets = [
            ...targetsSnapshot.members,
            ...targetsSnapshot.recruits
        ];

        // Tracks whether the shadow-lead registry write actually landed, so the stage
        // cannot report success while a database write silently failed.
        let shadowLeadWriteFailure: string | null = null;

        if (ingestionTargets.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: ingestionTargets.length });
            
            // Shared map to collect shadow leads across all concurrent tasks
            // EPHEMERAL: intentionally resets on cold start
            // [DECISION LOG] Using Map<string, { name: string }> to fix type mismatch pathogen.
            const globalShadowLeads = new Map<string, { name: string }>();

            const battleTasks = ingestionTargets.map(targetTag => async () => {
                try {
                    const battleLogApiResponse = await fetchWithRotation(`/players/${encodeURIComponent(targetTag)}/battlelog`);
                    if (battleLogApiResponse.ok) {
                        const battleLogRoyalePayload: unknown = await battleLogApiResponse.json();
                        
                        // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                        // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes in battle logs.
                        const battleLogValidationResult = v.safeParse(RoyaleBattleLogSchema, battleLogRoyalePayload);

                        logAudit('S6_BATTLES', 'integrity_checked', {
                            tag: targetTag,
                            passed: battleLogValidationResult.success,
                            details: battleLogValidationResult.success ? 'Battle log validated via Valibot' : 'Malformed battle log payload'
                        });

                        if (battleLogValidationResult.success && battleLogValidationResult.output.length > 0) {
                            const battleLog = battleLogValidationResult.output;
                            // Ingest battles
                            const { error: rpcIngestionError } = await supabase.rpc('ingest_player_battles', {
                                p_tag: targetTag,
                                p_payload: battleLog
                            });
                            
                            if (rpcIngestionError) {
                                logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'RPC Failure', details: rpcIngestionError });
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
                    } else if (battleLogApiResponse.status === 404) {
                        // [THREAT:] supabase.rpc() resolves with { error } instead of throwing, so an
                        // unchecked call would log the ghost as purged even when the write failed,
                        // keeping the dead tag in the ingestion target set to burn API quota on a
                        // 404 every 30-minute cycle.
                        const { error: deadRecruitReportError } = await supabase.rpc('report_dead_recruit', { p_player_tag: targetTag });
                        if (deadRecruitReportError) {
                            logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'Failed to report dead recruit', details: deadRecruitReportError });
                        } else {
                            logAudit('S6_BATTLES', 'called', { tag: targetTag, action: 'purged_ghost' });
                        }
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
                // [DECISION LOG] Renamed anemic variables 'tag' and 'data' to 'playerTag' and 'opponentMetadata'
                // to satisfy domain-descriptive naming constraints in Layer 1.
                const validLeads = Array.from(globalShadowLeads.entries()).map(([playerTag, opponentMetadata]) => ({
                    player_tag: normalizeTag(playerTag),
                    player_name: opponentMetadata.name,
                    trophies: 0 // Battle logs do not provide ladder metrics.
                }));

                const recruits = validLeads.map(lead => ({
                    ...lead,
                    source: 'SHADOW',
                    status: 'ACTIVE'
                }));

                // L2 Drivers: Sync to universal player registry first
                // [THREAT:] This registry write is two-phase and NOT atomic. drivers.recruits
                // carries a foreign key onto the player registry, so running sync_recruits after a
                // failed sync_players raises FK violations and loses the entire harvest. The error
                // must be captured because supabase.rpc() resolves with { error } and never throws.
                // [DECISION LOG] Phase 2 is gated on phase 1 succeeding, and either failure is
                // propagated to results.battles instead of being reported as a clean stage.
                const { error: playerRegistryError } = await supabase.rpc('sync_players', { p_players: validLeads });
                if (playerRegistryError) {
                    shadowLeadWriteFailure = `Player Registry Sync Failure: ${playerRegistryError.message}`;
                    logAudit('S6_BATTLES', 'error', { message: 'Player Registry Sync Failure - skipping recruit upsert to avoid foreign key violations', details: playerRegistryError });
                } else {
                    // L2 Drivers: Upsert to shadow recruitment queue
                    const { error: leadErr } = await supabase.rpc('sync_recruits', { p_recruits: recruits });
                    if (leadErr) {
                        shadowLeadWriteFailure = `Shadow Lead Batch Upsert Failure: ${leadErr.message}`;
                        logAudit('S6_BATTLES', 'error', { message: 'Shadow Lead Batch Upsert Failure', details: leadErr });
                    }
                }
            }
        }
        results.battles.success = shadowLeadWriteFailure === null;
        if (shadowLeadWriteFailure !== null) {
            results.battles.error = shadowLeadWriteFailure;
        }
        logAudit('S6_BATTLES', 'terminated', { tags: ingestionTargets.length, success: results.battles.success });
    } catch (battleLogError: unknown) {
        const errorMessage = battleLogError instanceof Error ? battleLogError.message : String(battleLogError);
        results.battles.error = errorMessage;
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw battleLogError;
    }
}
