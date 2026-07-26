// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry, RecruitSyncRow } from "../../_shared/types.ts";
import { calculateRpos, calculateWeightedWinRate } from "../../_shared/utils.ts";
import {
    PROFILER_BATCH_CEILING,
    RECENT_SCAN_THRESHOLD_MS,
    CONCURRENCY_PROFILER
} from "../../_shared/config.ts";
import * as v from "npm:valibot@1.4.2";
import { RoyalePlayerSchema, RecruitFateSchema, StaleRecruitSchema } from "../../_shared/schemas.ts";

/**
 * STAGE: Profiling & Ingestion
 *
 * @remarks
 * This stage orchestrates the enrichment of discovered player tags with deep
 * profile data from the Royale API. It enforces strict validation boundaries
 * and executes bulk ingestion into the recruitment substrate.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Stage (Headhunter Scanner)
 * - **Satisfaction:** ADR Section II (Shared Substrate usage) and ADR Section III (Validation Boundaries).
 *
 * **Side Effects:**
 * - **External API:** Performs throttled fetches against the Royale API.
 * - **Database:** Executes multiple RPCs (`sync_recruits`, `report_dead_recruit`, `get_recruits_fate`, `get_top_50_threshold`).
 * - **Telemetry:** Updates the `ScannerStats` object with ingestion results.
 *
 * @param candidates - Map of discovered tags and their discovery source.
 * @param exclusionSet - Set of tags to ignore (existing members or blacklisted players).
 * @param requiredTrophies - Minimum trophy threshold for admission.
 * @param stats - Shared stats object for telemetry tracking.
 * @param logAudit - Function to record stage execution events.
 */
export async function runProfiler(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
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
        const { data: recentScansRaw, error: recentScansError } = await supabase
            .schema('drivers')
            .from('recruits')
            .select('player_tag')
            .in('player_tag', tagsToProfile)
            .gt('last_scan', thirtyMinutesAgo);

        // [GUARD] VALIDATION BOUNDARY: Database ingress must pass through a Valibot schema.
        // [THREAT:] Prevents runtime crashes if the database schema drift or malformed data exists in the recruits table.
        // [DECISION LOG] Explicitly validating the shape of recentScansRaw before processing.
        const recentScansIntegrity = v.safeParse(v.array(StaleRecruitSchema), recentScansRaw ?? []);

        logAudit('PROFILING', 'integrity_checked', {
            stage: 'RECENT_SCANS_FETCH',
            passed: recentScansIntegrity.success && !recentScansError,
            details: recentScansError ? recentScansError.message : (recentScansIntegrity.success ? 'Recent scans validated' : 'Malformed recent scans payload')
        });

        if (!recentScansIntegrity.success) {
            console.error(`[PROFILING] Recent scans validation failed: ${JSON.stringify(recentScansIntegrity.issues)}`);
        }

        const recentScans = recentScansIntegrity.success ? recentScansIntegrity.output : [];
        const recentlyScannedTags = new Set(recentScans.map(recruitCandidate => recruitCandidate.player_tag));
        const tagsToFetch = tagsToProfile.filter(tagCandidate => !recentlyScannedTags.has(tagCandidate));

        console.log(`[PROFILING] Pre-filtered: ${recentlyScannedTags.size} tags scanned in the last 30 minutes skipped. Remaining tags to fetch: ${tagsToFetch.length}`);

        const validRecruits: RecruitSyncRow[] = [];
        let validCount = 0;
        let newCount = 0;
        let refreshCount = 0;
        let invalidCount = 0;
        let withWins = 0;
        let withBattleCount = 0;

        const profileTasks = tagsToFetch.map(playerTag => async () => {
            logAudit('PROFILING', 'called', { tag: playerTag });
            try {
                const playerProfileApiResponse = await fetchWithRotation(`/players/${encodeURIComponent(playerTag)}`);
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
                            const potentialRawScore = calculateRpos({
                                trophies,
                                lifetime_donations: donations,
                                legacy_war_wins: warWins,
                                wins,
                                battle_count: battleCount,
                                three_crown_wins,
                                challenge_cards_won: cards,
                                challenge_max_wins,
                            });
                            const winRate = calculateWeightedWinRate(wins, battleCount, three_crown_wins);

                            validRecruits.push({
                                player_tag: playerProfileSnapshot.tag,
                                player_name: playerProfileSnapshot.name,
                                trophies,
                                donations,
                                cards,
                                war_wins: warWins,
                                raw_potential_score: potentialRawScore,
                                win_rate: winRate,
                                source: candidates.get(playerTag) || 'UNKNOWN',
                                status: 'ACTIVE'
                            });
                            if (wins > 0) withWins++;
                            if (battleCount > 0) withBattleCount++;
                            console.log(`[PROFILER] Admitted ${playerProfileSnapshot.tag} | trophies=${trophies} war=${warWins} donations=${donations} wins=${wins} battles=${battleCount} winRate=${winRate} rawScore=${potentialRawScore}`);
                            validCount++;
                        } else {
                            console.log(`[PROFILER] Rejected ${playerProfileSnapshot.tag} | hasClan=${!!playerProfileSnapshot.clan?.tag} inExclusion=${exclusionSet.has(playerProfileSnapshot.tag)} trophies=${playerProfileSnapshot.trophies || 0} required=${requiredTrophies}`);
                            invalidCount++;
                        }
                    } else {
                        invalidCount++;
                    }
                } else {
                    if (playerProfileApiResponse.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: playerTag });
                        logAudit('PROFILING', 'called', { tag: playerTag, action: 'blacklisted_ghost' });
                        console.log(`[PROFILING] Player ${playerTag} is a ghost (404). Blacklisted.`);
                    } else {
                        console.error(`[PROFILING] Player ${playerTag} fetch failed with HTTP ${playerProfileApiResponse.status}`);
                    }
                    stats.errors.push(`Profile(${playerTag}): ${playerProfileApiResponse.status}`);
                    logAudit('PROFILING', 'integrity_checked', { passed: false, details: `HTTP_${playerProfileApiResponse.status}` });
                    logAudit('PROFILING', 'error', { tag: playerTag, status: playerProfileApiResponse.status });
                    invalidCount++;
                }
            } catch (profilingExecutionError: unknown) {
                const errorMessage = profilingExecutionError instanceof Error ? profilingExecutionError.message : String(profilingExecutionError);
                stats.errors.push(`Profile(${playerTag}): ${errorMessage}`);
                logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('PROFILING', 'error', { tag: playerTag, message: errorMessage });
                console.error(`[PROFILING] Exception while profiling ${playerTag}: ${errorMessage}`);
                invalidCount++;
            }
        });
        
        console.log(`[PROFILING] Batch processing ${tagsToFetch.length} profiles...`);
        await processBatch(profileTasks, CONCURRENCY_PROFILER);
        console.log(`[PROFILING] Batch processing complete. Valid: ${validCount}, Invalid/Filtered: ${invalidCount}`);

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
            const { data: existingRecruitsRaw, error: existingRecruitsError } = await supabase
                .schema('drivers')
                .from('recruits')
                .select('player_tag')
                .in('player_tag', validRecruits.map(tagCandidate => tagCandidate.player_tag));

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
            
            const existingRecruits = existingRecruitsIntegrity.success ? existingRecruitsIntegrity.output : [];
            const existingTags = new Set(existingRecruits.map(existingRecruitSnapshot => existingRecruitSnapshot.player_tag));
            validRecruits.forEach(recruitCandidateSnapshot => {
                if (existingTags.has(recruitCandidateSnapshot.player_tag)) refreshCount++;
                else newCount++;
            });

            console.log(`[PROFILING] Ingesting ${validRecruits.length} recruits into database...`);
            for (const [recruitSource, recruitBatch] of bySource) {
                const { error: ingestionError } = await supabase.rpc('sync_recruits', {
                    p_recruits: recruitBatch
                });
                if (ingestionError) {
                    stats.errors.push(`Ingest(${recruitSource}): ${ingestionError.message}`);
                    logAudit('PROFILING', 'error', { message: `DB Ingestion Failure (${recruitSource})`, details: ingestionError });
                    console.error(`[PROFILING] DB Ingestion Failure (${recruitSource}): ${ingestionError.message}`);
                } else {
                    console.log(`[PROFILING] Successfully ingested ${recruitBatch.length} recruits from source ${recruitSource}`);
                }
            }

            // --- INGESTION FATE TELEMETRY ---
            // [DECISION LOG] Newly ingested recruits are tracked to verify their promotion from QUEUE to ACTIVE/BENCHED.
            const newTags = validRecruits
                .filter(recruitCandidate => !existingTags.has(recruitCandidate.player_tag))
                .map(recruitCandidate => recruitCandidate.player_tag);
            
            if (newTags.length > 0) {
                console.log(`[PROFILING] Post-ingestion fate check for ${newTags.length} recruits...`);
                
                let fateResults: v.InferOutput<typeof RecruitFateSchema>[] = [];
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
                        const { data: recruitsFateRaw, error: recruitsFateError } = await supabase
                            .rpc('get_recruits_fate', { tags: newTags });

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
                            }
                        } else if (recruitsFateError) {
                            console.error(`[PROFILING] Fate check attempt ${attempts} error: ${JSON.stringify(recruitsFateError)}`);
                        }
                    } catch (fateCheckExecutionError: unknown) {
                        const errorMessage = fateCheckExecutionError instanceof Error ? fateCheckExecutionError.message : String(fateCheckExecutionError);
                        console.error(`[PROFILING] Fate check attempt ${attempts} exception: ${errorMessage}`);
                    }
                }

                // [THREAT:] If the telemetry loop fails to find converged results after 4 attempts,
                // the stage stats (new_recruits_active, etc.) will be zeroed, leading to
                // inaccurate dashboard reporting despite successful ingestion.
                if (fateResults.length > 0) {
                    // Fetch Top 50 Threshold (lowest score in active pool)
                    const { data: top50ThresholdRaw, error: top50ThresholdError } = await supabase.rpc('get_top_50_threshold');
                    
                    // [GUARD] VALIDATION BOUNDARY: Database RPC results must be validated.
                    // [THREAT:] Missing or malformed threshold would corrupt Top 50 telemetry reporting.
                    // [DECISION LOG] Replacing typeof check with strict Valibot validation for the RPC result.
                    const top50ThresholdIntegrity = v.safeParse(v.number(), top50ThresholdRaw);

                    logAudit('PROFILING', 'integrity_checked', {
                        stage: 'TOP50_THRESHOLD_FETCH',
                        passed: top50ThresholdIntegrity.success && !top50ThresholdError,
                        details: top50ThresholdError ? top50ThresholdError.message : (top50ThresholdIntegrity.success ? 'Threshold validated' : 'Malformed threshold payload')
                    });

                    const top50ScoreThreshold = top50ThresholdIntegrity.success ? top50ThresholdIntegrity.output : 0;

                    stats.new_recruits_active = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'ACTIVE').length;
                    stats.new_recruits_benched = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'BENCHED').length;
                    stats.new_recruits_top50 = fateResults.filter(fateEntryCandidate => fateEntryCandidate.status === 'ACTIVE' && Number(fateEntryCandidate.raw_potential_score) >= top50ScoreThreshold).length;
                    
                    console.log(`[PROFILING] Fate Finalized: Active=${stats.new_recruits_active}, Benched=${stats.new_recruits_benched}, Top50=${stats.new_recruits_top50}`);
                } else {
                    console.warn(`[PROFILING] Fate check FAILED after ${maxAttempts} attempts for ${newTags.length} tags.`);
                }
            }
            
            stats.recruits_ingested = (stats.recruits_ingested || 0) + validRecruits.length;
            stats.new_recruits = (stats.new_recruits || 0) + newCount;
            stats.refreshed_recruits = (stats.refreshed_recruits || 0) + refreshCount;
            stats.highest_rpos = maxRpos === -Infinity ? 0 : Math.round(maxRpos);
            stats.lowest_rpos = minRpos === Infinity ? 0 : Math.round(minRpos);
            stats.ingested_by_source = sourceCounts;
        }
        stats.profiles_scanned = tagsToFetch.length;
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
