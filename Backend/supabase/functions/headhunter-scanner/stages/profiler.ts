// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { withAbortSignal, throwIfAborted } from "../../_shared/abortSignal.ts";
import { ScannerStats, AuditEntry, RecruitSyncRow, RecruitSource } from "../../_shared/types.ts";
import { getRposComposition, calculateWeightedWinRate } from "../../_shared/utils.ts";
import {
    PROFILER_BATCH_CEILING,
    RECENT_SCAN_THRESHOLD_MS,
    CONCURRENCY_PROFILER
} from "../../_shared/config.ts";
import * as v from "npm:valibot@1.5.0";
import { RoyalePlayerSchema, RecruitFateSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

/**
 * STAGE: Profiling & Ingestion
 *
 * @remarks
 * This stage orchestrates the enrichment of discovered player tags with deep
 * profile data from the Royale API. It enforces strict validation boundaries,
 * deduplicates candidates against a 30-minute recent-scan window via public RPC,
 * and executes bulk ingestion into the recruitment substrate.
 *
 * **PostgREST Schema Access Boundary:**
 * PostgREST Data API roles (`authenticator`) expose only public schemas. Direct table
 * queries against `drivers.*` fail in production with "Invalid schema: drivers". All
 * reads and writes (`get_recent_scans`, `get_recruits_fate`, `sync_recruits`) are
 * brokered through `public.*` RPC functions.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Stage (Headhunter Scanner)
 * - **Satisfaction:** ADR Section II (Shared Substrate usage) and ADR Section III (Validation Boundaries).
 *
 * **Side Effects:**
 * - **External API:** Performs throttled batch fetches against the Royale API via muscle worker pool.
 * - **Database:** Executes public RPCs (`get_recent_scans`, `sync_recruits`, `report_dead_recruit`, `get_recruits_fate`, `get_top_50_threshold`).
 * - **Telemetry:** Updates the shared `ScannerStats` object with ingestion, RPoS distribution, and promotion fate metrics.
 *
 * @param candidates - Map of discovered tags and their discovery source string.
 * @param exclusionSet - Set of player tags to ignore (existing clan members or blacklisted players).
 * @param requiredTrophies - Minimum trophy threshold required for player admission.
 * @param stats - Shared telemetry object for tracking profile counts and processing errors.
 * @param logAudit - Callback function to record structured stage audit entries.
 *
 * @throws {Error} Re-throws unrecoverable database RPC errors or schema validation failures during recent scans fetch.
 */
export async function runProfiler(
    candidates: Map<string, RecruitSource>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    signal?: AbortSignal,
    admissionSignal?: AbortSignal,
) {
    // [THREAT:] Un-truncated candidate lists could exceed the memory limits of the Edge Function.
    // [DECISION LOG] The profiler hard-caps at PROFILER_BATCH_CEILING to ensure predictable execution duration.
    const tagsToProfile = [...candidates.keys()].slice(0, PROFILER_BATCH_CEILING);
    if (tagsToProfile.length === 0) {
        console.log(`[PROFILING] No candidates to profile. Skipping.`);
        return;
    }

    logAudit('PROFILING', 'triggered', { count: tagsToProfile.length });
    console.log(`[PROFILING] Triggered. Profiling ${tagsToProfile.length} candidates.`);
    try {
        const thirtyMinutesAgo = Temporal.Now.instant().subtract({ milliseconds: RECENT_SCAN_THRESHOLD_MS }).toString();
        // [THREAT:] The Data API's `authenticator` role only exposes public/storage/
        // graphql_public/features (see pgrst.db_schemas) - `drivers` is not reachable
        // via `.schema('drivers')` in production, only locally where config.toml's
        // schema list happens to include it. Every other read in this file goes
        // through a public.* RPC for exactly this reason; this one must too.
        const { data: recentScansRaw, error: recentScansError } = await withAbortSignal(
            supabase.rpc('get_recent_scans', { p_tags: tagsToProfile, p_since: thirtyMinutesAgo }),
            signal,
        );

        // [GUARD] DATABASE EGRESS BOUNDARY: PostgREST selects resolve with { data, error };
        // they never throw, so the error is inspected BEFORE the payload is parsed.
        // [THREAT:] Parsing `recentScansRaw ?? []` on a failed read launders a hard database
        // failure into a legitimately-empty de-dupe set. The 30-minute recent-scan filter would
        // silently no-op and up to PROFILER_BATCH_CEILING profiles would be re-fetched from the
        // Royale API on every run. Failing here costs nothing because no API quota is spent yet.
        if (recentScansError) {
            logAudit('PROFILING', 'integrity_checked', {
                stage: 'RECENT_SCANS_FETCH',
                passed: false,
                details: recentScansError.message
            });
            console.error(`[PROFILING] Recent scans fetch failed: ${recentScansError.message}`);
            throw new Error(`Failed to fetch recent scans: ${recentScansError.message}`);
        }

        // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
        // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists in the recruits table.
        // [DECISION LOG] Explicitly validating the shape of recentScansRaw before processing.
        const recentScansIntegrity = v.safeParse(v.array(StaleRecruitSchema), recentScansRaw ?? []);

        logAudit('PROFILING', 'integrity_checked', {
            stage: 'RECENT_SCANS_FETCH',
            passed: recentScansIntegrity.success,
            details: recentScansIntegrity.success ? 'Recent scans validated' : 'Malformed recent scans payload'
        });

        // [DECISION LOG] A malformed payload is treated exactly like a failed read: the
        // de-dupe set is unknowable either way, and continuing with `[]` would trigger the
        // same mass re-fetch this guard exists to prevent.
        if (!recentScansIntegrity.success) {
            console.error(`[PROFILING] Recent scans validation failed: ${JSON.stringify(recentScansIntegrity.issues)}`);
            throw new Error('Failed to validate recent scans payload');
        }

        const recentScans = recentScansIntegrity.output;
        const recentlyScannedTags = new Set(recentScans.map(recruitCandidate => recruitCandidate.player_tag));
        const tagsToFetch = tagsToProfile.filter(tagCandidate => !recentlyScannedTags.has(tagCandidate));

        console.log(`[PROFILING] Pre-filtered: ${recentlyScannedTags.size} tags scanned in the last 30 minutes skipped. Remaining tags to fetch: ${tagsToFetch.length}`);

        const validRecruits: RecruitSyncRow[] = [];
        let validCount = 0;
        let newCount = 0;
        let refreshCount = 0;
        let invalidCount = 0;
        // Royale API calls that did not answer (any status but 404, a malformed profile, or a
        // thrown fetch). A 404 is an answer: the player no longer exists.
        let profileFetchFailures = 0;
        let withWins = 0;
        let withBattleCount = 0;

        const profileTasks = tagsToFetch.map(playerTag => async () => {
            logAudit('PROFILING', 'called', { tag: playerTag });
            try {
                const playerProfileApiResponse = await fetchWithRotation(`/players/${encodeURIComponent(playerTag)}`, undefined, admissionSignal ?? signal);
                logAudit('PROFILING', 'run', { tag: playerTag, status: playerProfileApiResponse.status });
                if (playerProfileApiResponse.ok) {
                    const playerProfileRaw: unknown = await playerProfileApiResponse.json();

                    // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                    // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
                    const playerProfileIntegrity = v.safeParse(RoyalePlayerSchema, playerProfileRaw);

                    logAudit('PROFILING', 'resulted_data', { tag: playerTag });
                    logAudit('PROFILING', 'integrity_checked', { 
                        tag: playerTag,
                        passed: playerProfileIntegrity.success,
                        details: playerProfileIntegrity.success ? 'Data shape validated via Valibot' : 'Malformed profile data'
                    });
                    
                    if (playerProfileIntegrity.success) {
                        const playerProfileSnapshot = playerProfileIntegrity.output;

                        if (!playerProfileSnapshot.clan?.tag && !exclusionSet.has(playerProfileSnapshot.tag) && (playerProfileSnapshot.trophies || 0) >= requiredTrophies) {
                            const trophies = playerProfileSnapshot.trophies || 0;
                            const donations = playerProfileSnapshot.totalDonations || 0;
                            const warWins = playerProfileSnapshot.warDayWins || 0;
                            const cards = playerProfileSnapshot.challengeCardsWon || 0;
                            const wins = playerProfileSnapshot.wins || 0;
                            const battleCount = playerProfileSnapshot.battleCount || 0;
                            const three_crown_wins = playerProfileSnapshot.threeCrownWins || 0;
                            const challenge_max_wins = playerProfileSnapshot.challengeMaxWins || 0;

                            // [DECISION LOG] RPoS (Raw Potential Score) CALCULATION:
                            // Refactored to use centralized L1 Core utility to ensure formula consistency.
                            const scoreComposition = getRposComposition({
                                trophies,
                                lifetime_donations: donations,
                                legacy_war_wins: warWins,
                                wins,
                                battle_count: battleCount,
                                three_crown_wins,
                                challenge_cards_won: cards,
                                challenge_max_wins,
                            });
                            const potentialRawScore = scoreComposition.rawScore;
                            const winRate = calculateWeightedWinRate(wins, battleCount, three_crown_wins);

                            // [THREAT:] drivers.recruits.source is NOT NULL and CHECK-constrained
                            // to four values, and these rows reach sync_recruits as ONE batch, so a
                            // single row carrying a rejected value fails every row travelling with
                            // it. The fallback here was 'UNKNOWN' - precisely the one value the
                            // constraint forbids - so the guard written to be safe was the only way
                            // to lose the whole batch. Unreachable today only because both writers
                            // of `candidates` set a literal; nothing enforced that.
                            // [DECISION LOG] A candidate whose provenance cannot be read is skipped
                            // and recorded, never relabelled. Substituting a plausible source is the
                            // PROVENANCE_ERASURE bug fixed in v14.50.33 wearing a different hat.
                            const discoverySource = candidates.get(playerTag);
                            if (discoverySource) {
                                validRecruits.push({
                                    player_tag: playerProfileSnapshot.tag,
                                    player_name: playerProfileSnapshot.name,
                                    trophies,
                                    donations,
                                    cards,
                                    war_wins: warWins,
                                    raw_potential_score: potentialRawScore,
                                    score_composition: scoreComposition,
                                    win_rate: winRate,
                                    source: discoverySource,
                                    status: 'ACTIVE'
                                });
                                if (wins > 0) withWins++;
                                if (battleCount > 0) withBattleCount++;
                                console.log(`[PROFILER] Admitted ${playerProfileSnapshot.tag} | trophies=${trophies} war=${warWins} donations=${donations} wins=${wins} battles=${battleCount} winRate=${winRate} rawScore=${potentialRawScore}`);
                                validCount++;
                            } else {
                                stats.errors.push(`Profiler: ${playerProfileSnapshot.tag} has no discovery source; skipped rather than batched with an invalid one`);
                                logAudit('PROFILING', 'error', {
                                    tag: playerProfileSnapshot.tag,
                                    message: 'Candidate has no discovery source; skipped to protect the sync_recruits batch'
                                });
                                console.warn(`[PROFILER] Skipped ${playerProfileSnapshot.tag}: no discovery source recorded for this candidate.`);
                                invalidCount++;
                            }
                        } else {
                            console.log(`[PROFILER] Rejected ${playerProfileSnapshot.tag} | hasClan=${!!playerProfileSnapshot.clan?.tag} inExclusion=${exclusionSet.has(playerProfileSnapshot.tag)} trophies=${playerProfileSnapshot.trophies || 0} required=${requiredTrophies}`);
                            invalidCount++;
                        }
                    } else {
                        profileFetchFailures++;
                        invalidCount++;
                    }
                } else {
                    if (playerProfileApiResponse.status === 404) {
                        // [THREAT:] supabase.rpc() resolves with { error } instead of throwing, so an
                        // unchecked call would log the tag as blacklisted even when the write failed,
                        // leaving the dead tag in the discovery pool to be re-fetched every run.
                        // [DECISION LOG] The 'blacklisted_ghost' audit entry is gated on RPC success.
                        const { error: deadRecruitReportError } = await withAbortSignal(
                            supabase.rpc('report_dead_recruit', { p_player_tag: playerTag }),
                            signal,
                        );
                        if (deadRecruitReportError) {
                            stats.errors.push(`Blacklist(${playerTag}): ${deadRecruitReportError.message}`);
                            logAudit('PROFILING', 'error', { tag: playerTag, message: 'Failed to blacklist ghost', details: deadRecruitReportError });
                            console.error(`[PROFILING] Failed to blacklist ghost ${playerTag}: ${deadRecruitReportError.message}`);
                        } else {
                            logAudit('PROFILING', 'called', { tag: playerTag, action: 'blacklisted_ghost' });
                            console.log(`[PROFILING] Player ${playerTag} is a ghost (404). Blacklisted.`);
                        }
                    } else {
                        profileFetchFailures++;
                        console.error(`[PROFILING] Player ${playerTag} fetch failed with HTTP ${playerProfileApiResponse.status}`);
                    }
                    stats.errors.push(`Profile(${playerTag}): ${playerProfileApiResponse.status}`);
                    logAudit('PROFILING', 'integrity_checked', { passed: false, details: `HTTP_${playerProfileApiResponse.status}` });
                    logAudit('PROFILING', 'error', { tag: playerTag, status: playerProfileApiResponse.status });
                    invalidCount++;
                }
            } catch (profilingExecutionError: unknown) {
                if (signal?.aborted || admissionSignal?.aborted) throw profilingExecutionError;
                const errorMessage = profilingExecutionError instanceof Error ? profilingExecutionError.message : String(profilingExecutionError);
                stats.errors.push(`Profile(${playerTag}): ${errorMessage}`);
                logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('PROFILING', 'error', { tag: playerTag, message: errorMessage });
                console.error(`[PROFILING] Exception while profiling ${playerTag}: ${errorMessage}`);
                profileFetchFailures++;
                invalidCount++;
            }
        });
        
        console.log(`[PROFILING] Batch processing ${tagsToFetch.length} profiles...`);
        let checkpointCompletedProfiles = false;
        try {
            await processBatch(profileTasks, CONCURRENCY_PROFILER, admissionSignal ?? signal);
            checkpointCompletedProfiles = Boolean(admissionSignal?.aborted);
        } catch (profileBatchError: unknown) {
            // An early admission cutoff cancels queued/in-flight Royale requests. Preserve
            // eligible responses already collected in memory before surfacing the failed run.
            throwIfAborted(signal);
            if (!admissionSignal?.aborted) throw profileBatchError;
            checkpointCompletedProfiles = true;
        }
        throwIfAborted(signal);

        if (checkpointCompletedProfiles) {
            if (validRecruits.length > 0) {
                const completedBySource = new Map<string, RecruitSyncRow[]>();
                for (const completedRecruit of validRecruits) {
                    const source = completedRecruit.source || 'UNKNOWN';
                    if (!completedBySource.has(source)) completedBySource.set(source, []);
                    completedBySource.get(source)!.push(completedRecruit);
                }

                for (const [source, completedBatch] of completedBySource) {
                    // The hard signal remains live only until the scanner's hard deadline.
                    // Each existing per-source RPC keeps DB004's synchronous rotation/fate path.
                    throwIfAborted(signal);
                    const { error: checkpointError } = await withAbortSignal(
                        supabase.rpc('sync_recruits', { p_recruits: completedBatch }),
                        signal,
                    );
                    throwIfAborted(signal);
                    if (checkpointError) {
                        stats.errors.push(`Checkpoint(${source}): ${checkpointError.message}`);
                        logAudit('PROFILING', 'error', { message: `Checkpoint ingestion failed (${source})`, details: checkpointError });
                    } else {
                        logAudit('PROFILING', 'run', { checkpointed: completedBatch.length, source });
                    }
                }
            }
            // This failed invocation must not continue into fate polling or report epoch success.
            throwIfAborted(admissionSignal);
        }
        console.log(`[PROFILING] Batch processing complete. Valid: ${validCount}, Invalid/Filtered: ${invalidCount}`);

        // [DECISION LOG] A candidate whose profile could not be fetched may have been a Top 50
        // recruit, so a run with unanswered profiles cannot claim it found none. Without this an
        // upstream outage profiled nobody, reported zero, and armed the epoch guard into more
        // scans against the same outage.
        if (profileFetchFailures > 0) {
            stats.top50_unknown_reasons.push(`Profiler: ${profileFetchFailures} profile fetch(es) unanswered by the Royale API`);
        }

        // Field health check: detect silent Royale API field renames or deprecations.
        // Key RPoS fields default to 0 via the schema, so a broken field is invisible
        // unless we actively verify that at least some players returned non-zero values.
        // [THREAT:] Implicit 'any' or anemic variables mask structural drift.
        // [DECISION LOG] Renamed 'r' to 'recruitCandidate' to satisfy CleanStack naming conventions.
        if (validRecruits.length >= 10) {
            const withTrophies = validRecruits.filter(recruitSnapshot => recruitSnapshot.trophies > 0).length;
            // war_wins is expected to be 0 across most/all modern players post RPoS
            // formula restructure (warDayWins froze when CW1 retired 2020-08-31),
            // so it is reported for visibility only and no longer treated as suspicious.
            const withWarWins = validRecruits.filter(recruitSnapshot => recruitSnapshot.war_wins > 0).length;
            const withDonations = validRecruits.filter(recruitSnapshot => recruitSnapshot.donations > 0).length;
            const healthReport = {
                trophies: `${withTrophies}/${validRecruits.length}`,
                war_wins: `${withWarWins}/${validRecruits.length}`,
                donations: `${withDonations}/${validRecruits.length}`,
                wins: `${withWins}/${validRecruits.length}`,
                battle_count: `${withBattleCount}/${validRecruits.length}`,
            };
            console.log(`[PROFILING] RPoS field health: ${JSON.stringify(healthReport)}`);

            const suspiciousFields: string[] = [];
            if (withTrophies === 0) suspiciousFields.push('trophies');
            if (withDonations === 0) suspiciousFields.push('totalDonations');
            if (withWins === 0) suspiciousFields.push('wins');
            if (withBattleCount === 0) suspiciousFields.push('battleCount');

            if (suspiciousFields.length > 0) {
                console.warn(`[PROFILING] RPoS FIELD ANOMALY: [${suspiciousFields.join(', ')}] returned 0 across all ${validRecruits.length} profiles - possible Royale API field rename or deprecation`);
                logAudit('PROFILING', 'integrity_checked', {
                    passed: false,
                    details: `rpos_field_anomaly: ${suspiciousFields.join(', ')} missing across all profiles`,
                    field_health: healthReport,
                });
            }
        }

        if (validRecruits.length > 0) {
            // Group recruits by their discovery source for accurate attribution
            const bySource = new Map<string, RecruitSyncRow[]>();
            let maxRpos = -Infinity;
            let minRpos = Infinity;
            const sourceCounts: Record<string, number> = {};

            for (const recruitSnapshot of validRecruits) {
                const recruitSource = recruitSnapshot.source || 'UNKNOWN';
                if (!bySource.has(recruitSource)) bySource.set(recruitSource, []);
                bySource.get(recruitSource)!.push(recruitSnapshot);

                // Track RPoS (Raw Potential Score)
                const score = recruitSnapshot.raw_potential_score || 0;
                if (score > maxRpos) maxRpos = score;
                if (score < minRpos) minRpos = score;

                // Track source counts
                sourceCounts[recruitSource] = (sourceCounts[recruitSource] || 0) + 1;
            }

            // Determine which recruits are truly new vs refreshed
            // [THREAT:] Same Data API schema boundary as the recent-scans fetch above:
            // `drivers` is not exposed in production. get_recruits_fate() already
            // returns one row per tag that exists in drivers.recruits with no
            // scan-recency filter, so it doubles as the existing-tag check here
            // without a dedicated RPC.
            const { data: existingRecruitsRaw, error: existingRecruitsError } = await withAbortSignal(
                supabase.rpc('get_recruits_fate', { tags: validRecruits.map(tagCandidate => tagCandidate.player_tag) }),
                signal,
            );

            // [GUARD] DATABASE EGRESS BOUNDARY: PostgREST selects resolve with { data, error };
            // they never throw, so the error is inspected BEFORE the payload is parsed.
            // [THREAT:] Parsing `existingRecruitsRaw ?? []` on a failed read makes EVERY recruit
            // look new. That inflates stats.new_recruits and stats.new_recruits_top50, which feeds
            // a fabricated p_top50 into update_epoch_state and disarms the epoch retry guard after
            // a scan that actually found nothing new.
            // [DECISION LOG] A failed read leaves the new-vs-refreshed split UNKNOWABLE, not empty.
            // The stage deliberately does NOT abort here: the profiles below are already paid for
            // in Royale API quota and their ingestion does not depend on this read. Instead the
            // derived telemetry (the new/refresh split and the post-ingestion fate check that
            // produces new_recruits_top50) is suppressed and the Top 50 count is marked unknown,
            // so the epoch guard is neither disarmed by a fabricated count nor re-armed by a
            // zero that only means the read failed.
            if (existingRecruitsError) {
                stats.errors.push(`ExistingRecruits: ${existingRecruitsError.message}`);
                console.error(`[PROFILING] Existing recruits fetch failed: ${existingRecruitsError.message}`);
            }

            // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
            // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists in the recruits table.
            // [DECISION LOG] Ensuring data integrity before determining if recruits are new or refreshed.
            const existingRecruitsIntegrity = v.safeParse(v.array(StaleRecruitSchema), existingRecruitsRaw ?? []);

            logAudit('PROFILING', 'integrity_checked', {
                stage: 'EXISTING_DATA_FETCH',
                passed: existingRecruitsIntegrity.success && !existingRecruitsError,
                details: existingRecruitsError ? existingRecruitsError.message : (existingRecruitsIntegrity.success ? 'Existing recruits validated' : 'Malformed existing recruits payload')
            });

            if (!existingRecruitsIntegrity.success) {
                console.error(`[PROFILING] Existing recruits validation failed: ${JSON.stringify(existingRecruitsIntegrity.issues)}`);
            }

            // Only a clean read establishes a trustworthy baseline of already-known tags.
            const existingBaselineResolved = !existingRecruitsError && existingRecruitsIntegrity.success;
            const existingRecruits = existingRecruitsIntegrity.success ? existingRecruitsIntegrity.output : [];
            const existingTags = new Set(existingRecruits.map(existingRecruitSnapshot => existingRecruitSnapshot.player_tag));
            if (existingBaselineResolved) {
                validRecruits.forEach(recruitCandidateSnapshot => {
                    if (existingTags.has(recruitCandidateSnapshot.player_tag)) refreshCount++;
                    else newCount++;
                });
            } else {
                stats.top50_unknown_reasons.push('Profiler: existing-recruit baseline unavailable');
                logAudit('PROFILING', 'integrity_checked', {
                    stage: 'NEW_RECRUIT_CLASSIFICATION',
                    passed: false,
                    details: 'Existing-recruit baseline unavailable: new/refresh split and Top 50 fate telemetry suppressed'
                });
                console.warn(`[PROFILING] Existing-recruit baseline unavailable - suppressing new/refresh split and Top 50 fate telemetry for this run.`);
            }

            console.log(`[PROFILING] Ingesting ${validRecruits.length} recruits into database...`);
            for (const [recruitSource, recruitBatch] of bySource) {
                const { error: ingestionError } = await withAbortSignal(
                    supabase.rpc('sync_recruits', { p_recruits: recruitBatch }),
                    signal,
                );
                if (ingestionError) {
                    stats.errors.push(`Ingest(${recruitSource}): ${ingestionError.message}`);
                    stats.top50_unknown_reasons.push(`Profiler: sync_recruits failed for ${recruitSource}`);
                    logAudit('PROFILING', 'error', { message: `DB Ingestion Failure (${recruitSource})`, details: ingestionError });
                    console.error(`[PROFILING] DB Ingestion Failure (${recruitSource}): ${ingestionError.message}`);
                } else {
                    console.log(`[PROFILING] Successfully ingested ${recruitBatch.length} recruits from source ${recruitSource}`);
                }
            }

            // --- INGESTION FATE TELEMETRY ---
            // [DECISION LOG] Newly ingested recruits are tracked to verify their promotion from QUEUE to ACTIVE/BENCHED.
            // Without a trustworthy baseline every recruit would be classified as new, so the
            // fate check is skipped entirely rather than run over the whole batch.
            const newTags = existingBaselineResolved
                ? validRecruits
                    .filter(recruitCandidate => !existingTags.has(recruitCandidate.player_tag))
                    .map(recruitCandidate => recruitCandidate.player_tag)
                : [];

            if (newTags.length > 0) {
                console.log(`[PROFILING] Post-ingestion fate check for ${newTags.length} recruits...`);
                
                let fateResults: v.InferOutput<typeof RecruitFateSchema>[] = [];
                // Set when a fate read fails: any snapshot held from an earlier attempt is then
                // unconverged by definition, and counting its QUEUE rows would report a guess.
                let fateReadFailed = false;
                let attempts = 0;
                const maxAttempts = 4; // Total 10s potential delay

                // [DECISION LOG] INCREMENTAL BACKOFF TELEMETRY:
                // Database triggers promote recruits from QUEUE to ACTIVE/BENCHED asynchronously.
                // We use an incremental backoff (1s, 2s, 3s, 4s) to wait for trigger convergence
                // without blocking the main execution path indefinitely.
                while (attempts < maxAttempts) {
                    attempts++;
                    // Incremental backoff: 1s, 2s, 3s, 4s
                    await new Promise(resolve => setTimeout(resolve, attempts * 1000));

                    try {
                        const { data: recruitsFateRaw, error: recruitsFateError } = await withAbortSignal(
                            supabase.rpc('get_recruits_fate', { tags: newTags }),
                            signal,
                        );

                        if (!recruitsFateError && recruitsFateRaw && Array.isArray(recruitsFateRaw) && recruitsFateRaw.length > 0) {
                            // [GUARD] VALIDATION BOUNDARY: Target C [1]
                            // [THREAT:] Unsafe type assertions bypass runtime integrity. Malformed RPC data would crash telemetry logic.
                            const recruitsFateIntegrity = v.safeParse(v.array(RecruitFateSchema), recruitsFateRaw);

                            if (recruitsFateIntegrity.success) {
                                fateResults = recruitsFateIntegrity.output;
                                const queuedCount = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'QUEUE').length;
                                if (queuedCount === 0) {
                                    console.log(`[PROFILING] Fate check converged on attempt ${attempts}`);
                                    break;
                                }
                                console.log(`[PROFILING] Fate check attempt ${attempts}: ${fateResults.length} found, ${queuedCount} still QUEUED...`);
                            } else {
                                console.error(`[PROFILING] Fate validation failed on attempt ${attempts}: ${JSON.stringify(recruitsFateIntegrity.issues)}`);
                                fateReadFailed = true;
                                break;
                            }
                        } else if (recruitsFateError) {
                            // [DECISION LOG] The backoff waits for triggers to promote rows, not for
                            // a failing database to recover; repeating a read that just failed only
                            // adds load, so a read error ends the check and the count stays unknown.
                            console.error(`[PROFILING] Fate check attempt ${attempts} error: ${JSON.stringify(recruitsFateError)}`);
                            fateReadFailed = true;
                            break;
                        }
                    } catch (fateCheckExecutionError: unknown) {
                        throwIfAborted(signal);
                        const errorMessage = fateCheckExecutionError instanceof Error ? fateCheckExecutionError.message : String(fateCheckExecutionError);
                        console.error(`[PROFILING] Fate check attempt ${attempts} exception: ${errorMessage}`);
                        fateReadFailed = true;
                        break;
                    }
                }

                // [THREAT:] When the fate read failed or never answered, the fate counts are
                // unknown. They are reported as null with a reason, never as 0, which would read
                // as "no new recruit was promoted" and arm the epoch guard.
                if (!fateReadFailed && fateResults.length > 0) {
                    // Fetch Top 50 Threshold (lowest score in active pool)
                    const { data: top50ThresholdRaw, error: top50ThresholdError } = await withAbortSignal(
                        supabase.rpc('get_top_50_threshold'),
                        signal,
                    );
                    
                    // [GUARD] VALIDATION BOUNDARY: Database RPC results must be validated.
                    // [THREAT:] Missing or malformed threshold would corrupt Top 50 telemetry reporting.
                    // [DECISION LOG] Replacing typeof check with strict Valibot validation for the RPC result.
                    const top50ThresholdIntegrity = v.safeParse(v.number(), top50ThresholdRaw);

                    logAudit('PROFILING', 'integrity_checked', {
                        stage: 'TOP50_THRESHOLD_FETCH',
                        passed: top50ThresholdIntegrity.success && !top50ThresholdError,
                        details: top50ThresholdError ? top50ThresholdError.message : (top50ThresholdIntegrity.success ? 'Threshold validated' : 'Malformed threshold payload')
                    });

                    stats.new_recruits_active = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'ACTIVE').length;
                    stats.new_recruits_benched = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'BENCHED').length;
                    // [DECISION LOG] A missing threshold used to default to 0, which counted every
                    // new ACTIVE recruit as Top 50 and disarmed the epoch guard on a guess. Without
                    // the threshold the count is unknown, not computed.
                    if (top50ThresholdIntegrity.success && !top50ThresholdError) {
                        const top50ScoreThreshold = top50ThresholdIntegrity.output;
                        stats.new_recruits_top50 = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'ACTIVE' && Number(fateEntryCandidate.raw_potential_score) >= top50ScoreThreshold).length;
                    } else {
                        stats.new_recruits_top50 = null;
                        stats.top50_unknown_reasons.push('Profiler: Top 50 threshold unavailable');
                    }
                    
                    console.log(`[PROFILING] Fate Finalized: Active=${stats.new_recruits_active}, Benched=${stats.new_recruits_benched}, Top50=${stats.new_recruits_top50 ?? 'unknown (threshold unavailable)'}`);
                } else {
                    stats.new_recruits_active = null;
                    stats.new_recruits_benched = null;
                    stats.new_recruits_top50 = null;
                    stats.top50_unknown_reasons.push(fateReadFailed
                        ? `Profiler: fate read failed before ${newTags.length} new recruit(s) converged`
                        : `Profiler: fate check unanswered for ${newTags.length} new recruit(s)`);
                    console.warn(`[PROFILING] Fate check FAILED after ${attempts} attempt(s) for ${newTags.length} tags: Active, Benched and Top50 unknown.`);
                }
            }
            
            stats.recruits_ingested = (stats.recruits_ingested || 0) + validRecruits.length;
            stats.new_recruits = (stats.new_recruits || 0) + newCount;
            stats.refreshed_recruits = (stats.refreshed_recruits || 0) + refreshCount;
            stats.highest_rpos = maxRpos === -Infinity ? 0 : Math.round(maxRpos);
            stats.lowest_rpos = minRpos === Infinity ? 0 : Math.round(minRpos);
            stats.ingested_by_source = sourceCounts;
        }
        // Accumulate, never assign: ghost-purge (S0) runs before this and rescan
        // (S4) after, and both increment the same shared counter. Assigning here
        // erased every profile the ghost purge had already fetched.
        stats.profiles_scanned += tagsToFetch.length;
        logAudit('PROFILING', 'terminated', { scanned: tagsToFetch.length, ingested: validRecruits.length });
        console.log(`[PROFILING] Terminated smoothly.`);
    } catch (profilerExecutionError: unknown) {
        const errorMessage = profilerExecutionError instanceof Error ? profilerExecutionError.message : String(profilerExecutionError);
        logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('PROFILING', 'error', { message: errorMessage });
        logAudit('PROFILING', 'terminated', { error: true });
        console.error(`[PROFILING] Fatal exception: ${errorMessage}`);
        throw profilerExecutionError;
    }
}
