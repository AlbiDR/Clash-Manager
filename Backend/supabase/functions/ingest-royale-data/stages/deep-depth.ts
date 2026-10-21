// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { withAbortSignal } from "../../_shared/abortSignal.ts";
import { IngestionWorkBudget } from "../work-budget.ts";
import { INGESTION_WRITE_BATCH_SIZE } from "../../_shared/config.ts";
import { RecruitWriter } from "../recruit-writer.ts";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
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
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    budget?: IngestionWorkBudget
): Promise<Map<string, string> | null> {
    if (recruitTags.length === 0) return new Map();

    const { data: rawLatest, error: latestError } = await withAbortSignal(supabase.rpc('get_latest_battle_times', {
        p_player_tags: recruitTags
    }), budget?.signal);

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
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    budget?: IngestionWorkBudget
) {
    logAudit('S6_BATTLES', 'triggered');
    try {
        const { data: rawTargets, error: targetsError } = await withAbortSignal(supabase.rpc('get_ingestion_targets'), budget?.signal);

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
            const selectedRecruitTags = new Set(targetsSnapshot.recruits);
            const skippableRecruits = Array.from(new Set(
                targetsSnapshot.recruits.filter(tag => !memberTags.has(tag))
            ));
            let latestBattleTimes: Map<string, string> | null = null;
            const cycleTargets = [...targetsSnapshot.members, ...targetsSnapshot.recruits.filter(tag => !memberTags.has(tag))]
                .filter((tag, index, tags) => tags.indexOf(tag) === index);
            const attemptedRecruits = new Set<string>();
            const attemptedMembers = new Set<string>();
            let membersFailed = 0;
            let targetsCompleted = 0;
            const writer = new RecruitWriter("SHADOW", budget);

            const makeBattleTask = (targetTag: string) => async () => {
                if (budget && !budget.canAdmit()) return;
                if (memberTags.has(targetTag)) attemptedMembers.add(targetTag);
                if (selectedRecruitTags.has(targetTag)) attemptedRecruits.add(targetTag);
                let memberPersisted = false;
                try {
                    const battleLogApiResponse = await fetchWithRotation(`/players/${encodeURIComponent(targetTag)}/battlelog`, undefined, budget?.admissionSignal);
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

                        if (!battleLogValidationResult.success && memberTags.has(targetTag)) membersFailed++;
                        if (battleLogValidationResult.success) {
                            const battleLog = battleLogValidationResult.output;

                            // [THREAT:] ~9 in 10 recruit ingests wrote nothing (measured 2026-09-26),
                            // yet each still cost a full PostgREST round trip.
                            // [DECISION LOG] Skip the RPC only when the log is provably already stored;
                            // shadow-lead harvesting below still runs on every fetched log.
                            if (!memberTags.has(targetTag) && isAlreadyIngested(battleLog, latestBattleTimes?.get(targetTag))) {
                                skippedUnchanged++;
                            } else {
                                const { error: rpcIngestionError } = await withAbortSignal(supabase.rpc('ingest_player_battles', {
                                    p_tag: targetTag,
                                    p_payload: battleLog
                                }), budget?.signal);

                                if (rpcIngestionError) {
                                    if (memberTags.has(targetTag)) membersFailed++;
                                    logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'RPC Failure', details: rpcIngestionError });
                                } else { memberPersisted = memberTags.has(targetTag); }
                            }

                            await writer.add(battleLog.flatMap(battle => battle.opponent ?? [])
                                .filter(opponent => opponent.tag && !opponent.clan?.tag)
                                .map(opponent => ({ tag: opponent.tag, name: opponent.name || 'Unknown Recruit', trophies: 0 })));

                        }
                    } else if (battleLogApiResponse.status === 404 && !memberTags.has(targetTag)) {
                        // [THREAT:] supabase.rpc() resolves with { error } instead of throwing, so an
                        // unchecked call would log the ghost as purged even when the write failed,
                        // keeping the dead tag in the ingestion target set to burn API quota on a
                        // 404 every 30-minute cycle.
                        const { error: deadRecruitReportError } = await withAbortSignal(supabase.rpc('report_dead_recruit', { p_player_tag: targetTag }), budget?.signal);
                        if (deadRecruitReportError) {
                            logAudit('S6_BATTLES', 'error', { tag: targetTag, message: 'Failed to report dead recruit', details: deadRecruitReportError });
                        } else {
                            logAudit('S6_BATTLES', 'called', { tag: targetTag, action: 'purged_ghost' });
                        }
                    } else if (!battleLogApiResponse.ok && memberTags.has(targetTag)) {
                        membersFailed++;
                    }
                } catch (battleLogError: unknown) {
                    const errorMessage = battleLogError instanceof Error ? battleLogError.message : String(battleLogError);
                    if (memberTags.has(targetTag) && !memberPersisted) membersFailed++;
                    logAudit('S6_BATTLES', 'error', { tag: targetTag, message: errorMessage });
                }
                finally { targetsCompleted++; }
            };
            // Settle all member work before admitting any optional recruit work.
            // Each group releases its fetched payloads before starting another.
            for (const [phase, group] of [cycleTargets.filter(tag => memberTags.has(tag)), cycleTargets.filter(tag => !memberTags.has(tag))].entries()) {
                if (phase === 1 && group.length && (!budget || budget.canAdmit())) {
                    latestBattleTimes = await fetchLatestBattleTimes(skippableRecruits, logAudit, budget);
                    if (latestBattleTimes === null) {
                        recruitsDeferred = group.length;
                        logAudit('S6_BATTLES', 'error', { message: 'Latest battle times unavailable: recruit battle logs deferred to the next cycle', recruits_deferred: recruitsDeferred });
                        break;
                    }
                }
                for (let offset = 0; offset < group.length; offset += 6) {
                    if (budget && !budget.canAdmit()) break;
                    await processBatch(group.slice(offset, offset + 6).map(makeBattleTask), 6);
                }
            }
            for (let offset = 0; offset < attemptedRecruits.size; offset += INGESTION_WRITE_BATCH_SIZE) {
                const { error } = await withAbortSignal(supabase.rpc('record_recruit_battle_polls', {
                    p_player_tags: [...attemptedRecruits].slice(offset, offset + INGESTION_WRITE_BATCH_SIZE),
                }), budget?.signal);
                if (error) {
                    shadowLeadWriteFailure = 'Recruit poll acknowledgement failed';
                    Object.assign(results.battles, { cursor_ack_failed: true });
                    logAudit('S6_BATTLES', 'error', { message: shadowLeadWriteFailure });
                }
            }
            const membersDeferred = memberTags.size - attemptedMembers.size;
            Object.assign(results.battles, {
                members_attempted: attemptedMembers.size, members_failed: membersFailed, members_deferred: membersDeferred,
                recruits_attempted: attemptedRecruits.size,
                recruits_deferred: selectedRecruitTags.size - attemptedRecruits.size,
                targets_completed: targetsCompleted,
            });
            if (membersFailed || membersDeferred) {
                shadowLeadWriteFailure = 'Required member battle polling incomplete';
                logAudit('S6_BATTLES', 'error', { message: shadowLeadWriteFailure, members_failed: membersFailed, members_deferred: membersDeferred });
            }

            await writer.finish();
            if (writer.error) {
                shadowLeadWriteFailure = writer.error;
                logAudit('S6_BATTLES', 'error', { message: writer.error });
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
        Object.assign(results.battles, { members_failed: 1 });
        logAudit('S6_BATTLES', 'error', { message: errorMessage });
        logAudit('S6_BATTLES', 'terminated', { error: true });
        throw battleLogError;
    }
}
