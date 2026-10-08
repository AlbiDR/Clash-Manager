// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { normalizeTag } from "../../_shared/utils.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot@1.5.0";
import { RoyaleBattleLogSchema, IngestionTargetsSchema, LatestBattleTimesSchema } from "../../_shared/schemas.ts";

/** The exact `battleTime` shape the Royale API emits and get_latest_battle_times() renders. */
const ROYALE_BATTLE_TIME = /^\d{8}T\d{6}\.\d{3}Z$/;

/**
 * True only when every battle in a fetched log is provably already stored.
 *
 * @remarks
 * Both sides are fixed-width `YYYYMMDDTHHMMSS.mmmZ` strings, so lexical order is
 * chronological order and no date parsing is needed.
 * Satisfies ADR Section IV: Resilience.
 *
 * [THREAT: SILENT_BATTLE_LOSS] A false positive here silently loses battles, because the ingest RPC is skipped.
 * [DECISION LOG] Every uncertain case answers false (ingest as before): no stored time,
 * an empty log, or either side not matching the exact format. A wrong answer can
 * therefore only cost one redundant RPC, never a missed battle.
 *
 * @param battleLog - The validated battle log fetched from the Royale API.
 * @param latestStored - The newest stored battle time for this player, if any.
 * @returns Whether the ingest RPC can be skipped for this player.
 */
export function isAlreadyIngested(
    battleLog: ReadonlyArray<{ battleTime: string }>,
    latestStored: string | undefined
): boolean {
    if (latestStored === undefined || !ROYALE_BATTLE_TIME.test(latestStored)) return false;
    let newestFetched: string | null = null;
    for (const battle of battleLog) {
        if (!ROYALE_BATTLE_TIME.test(battle.battleTime)) return false;
        if (newestFetched === null || battle.battleTime > newestFetched) newestFetched = battle.battleTime;
    }
    return newestFetched !== null && newestFetched <= latestStored;
}

/**
 * Fetches the newest stored battle time for each recruit tag.
 *
 * @remarks
 * Queries database procedures for recruit battle times and validates against LatestBattleTimesSchema.
 * Satisfies ADR Section III: Validation Boundaries and ADR Section IV: Resilience.
 *
 * [THREAT: INGESTION_BLOCKADE] This lookup gates only recruits, so it can never stop member ingestion.
 * [DECISION LOG] An RPC error or malformed payload returns `null`, meaning "could not tell",
 * never an empty map. An empty map made {@link isAlreadyIngested} answer false for every
 * recruit, so the one cycle in which the database was too slow to answer this read was
 * also the cycle that re-sent every recruit's battle log to it. The caller defers those
 * recruits to the next cycle instead.
 *
 * @param recruitTags - Array of player tags to look up in the database.
 * @param logAudit - Telemetry logging callback function.
 * @returns Map pairing player tags to their latest stored battleTime string, or `null`
 *          when the read could not be answered.
 */
async function fetchLatestBattleTimes(
    recruitTags: string[],
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
): Promise<Map<string, string> | null> {
    if (recruitTags.length === 0) return new Map();

    const { data: rawLatest, error: latestError } = await supabase.rpc('get_latest_battle_times', {
        p_player_tags: recruitTags
    });

    // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
    const latestValidation = v.safeParse(LatestBattleTimesSchema, rawLatest ?? []);

    logAudit('S6_BATTLES', 'integrity_checked', {
        stage: 'LATEST_BATTLE_TIMES',
        passed: latestValidation.success && !latestError,
        details: latestError ? latestError.message : (latestValidation.success ? 'Latest battle times validated' : 'Malformed latest battle times payload')
    });

    if (latestError || !latestValidation.success) return null;
    return new Map(latestValidation.output.map(row => [row.player_tag, row.latest_battle_time]));
}

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
 *
 * Satisfies ADR Section III: Validation Boundaries and ADR Section IV: Resilience.
 *
 * [THREAT: TWO_PHASE_WRITE_DESYNC]
 * Ensures player registry sync succeeds before recruit upsert to prevent foreign key violations.
 *
 * @param results - Ingestion execution result accumulator.
 * @param logAudit - Telemetry audit sink function.
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
        const ingestionTargets = Array.from(new Set([
            ...targetsSnapshot.members,
            ...targetsSnapshot.recruits
        ]));

        // Tracks whether the shadow-lead registry write actually landed, so the stage
        // cannot report success while a database write silently failed.
        let shadowLeadWriteFailure: string | null = null;

        // Counts recruits whose battle log held nothing new, so the saving stays visible.
        let skippedUnchanged = 0;

        // Recruits left for the next cycle because their skip check could not be answered.
        let recruitsDeferred = 0;

        if (ingestionTargets.length > 0) {
            logAudit('S6_BATTLES', 'called', { tags_count: ingestionTargets.length });

            // [DECISION LOG] Only recruits may skip the ingest RPC. For members it also
            // reschedules next_poll_at (their tiered polling), so skipping it would change
            // how often they are polled. A tag present in both lists is treated as a member.
            const memberTags = new Set(targetsSnapshot.members);
            const skippableRecruits = Array.from(new Set(
                targetsSnapshot.recruits.filter(tag => !memberTags.has(tag))
            ));
            const latestBattleTimes = await fetchLatestBattleTimes(skippableRecruits, logAudit);

            // [DECISION LOG] DEFER, DO NOT FLOOD: when the skip check could not be answered,
            // this cycle ingests members only. Members never consult the check, so their
            // polling is unchanged; the deferred recruits are retried on the next cycle.
            // If the read can never answer (the RPC dropped by a bad deploy), recruits stay
            // deferred, and that is accepted on purpose: every such cycle reports the stage
            // failed with the count deferred, so the cause is visible in each run's telemetry
            // instead of hidden behind a full re-ingest. Recruit battle logs are enrichment: the
            // next answered read ingests each recruit's last 25 battles, losing only battles
            // that scrolled out of that window while the read was failing.
            const deferredRecruits = new Set(latestBattleTimes === null ? skippableRecruits : []);
            recruitsDeferred = deferredRecruits.size;
            if (recruitsDeferred > 0) {
                logAudit('S6_BATTLES', 'error', {
                    message: 'Latest battle times unavailable: recruit battle logs deferred to the next cycle',
                    recruits_deferred: recruitsDeferred
                });
                console.warn(`[S6_BATTLES] Latest battle times unavailable: ${recruitsDeferred} recruit(s) deferred to the next cycle.`);
            }
            const cycleTargets = ingestionTargets.filter(targetTag => !deferredRecruits.has(targetTag));

            // Shared map to collect shadow leads across all concurrent tasks
            // EPHEMERAL: intentionally resets on cold start
            // [DECISION LOG] Using Map<string, { name: string }> to fix type mismatch pathogen.
            const globalShadowLeads = new Map<string, { name: string }>();

            const battleTasks = cycleTargets.map(targetTag => async () => {
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

                            // [THREAT:] ~9 in 10 recruit ingests wrote nothing (measured 2026-09-26),
                            // yet each still cost a full PostgREST round trip.
                            // [DECISION LOG] Skip the RPC only when the log is provably already stored;
                            // shadow-lead harvesting below still runs on every fetched log.
                            if (!memberTags.has(targetTag) && isAlreadyIngested(battleLog, latestBattleTimes?.get(targetTag))) {
                                skippedUnchanged++;
                            } else {
                                const { error: rpcIngestionError } = await supabase.rpc('ingest_player_battles', {
                                    p_tag: targetTag,
                                    p_payload: battleLog
                                });

                                if (rpcIngestionError) {
                                    logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'RPC Failure', details: rpcIngestionError });
                                }
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
        const deferralFailure = recruitsDeferred > 0
            ? `${recruitsDeferred} recruit(s) deferred: latest battle times unavailable`
            : null;
        const battleFailures = [shadowLeadWriteFailure, deferralFailure].filter((failure): failure is string => failure !== null);
        results.battles.success = battleFailures.length === 0;
        if (battleFailures.length > 0) {
            results.battles.error = battleFailures.join('; ');
        }
        logAudit('S6_BATTLES', 'terminated', { tags: ingestionTargets.length, skipped_unchanged: skippedUnchanged, recruits_deferred: recruitsDeferred, success: results.battles.success });
    } catch (battleLogError: unknown) {
        const errorMessage = battleLogError instanceof Error ? battleLogError.message : String(battleLogError);
        results.battles.error = errorMessage;
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw battleLogError;
    }
}
