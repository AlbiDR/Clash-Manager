// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyalePlayerSchema, RecruitFateSchema } from "../../_shared/schemas.ts";

interface ValidRecruit {
    player_tag: string;
    player_name: string;
    trophies: number;
    donations: number;
    cards: number;
    war_wins: number;
    raw_potential_score: number;
    source: string;
    status: string;
}

/**
 * Stage: Profiling & Ingestion
 * Fetches deep profile data for discovered candidates and ingests them into raw logs.
 */
export async function runProfiler(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    const tagsToProfile = [...candidates.keys()].slice(0, 500);
    if (tagsToProfile.length === 0) {
        console.log(`[PROFILING] No candidates to profile. Skipping.`);
        return;
    }

    logAudit('PROFILING', 'triggered', { count: tagsToProfile.length });
    console.log(`[PROFILING] Triggered. Profiling ${tagsToProfile.length} candidates.`);
    try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentScans } = await supabase
            .schema('drivers')
            .from('recruits')
            .select('player_tag')
            .in('player_tag', tagsToProfile)
            .gt('last_scan', thirtyMinutesAgo);

        const recentlyScannedTags = new Set(recentScans?.map(r => r.player_tag) || []);
        const tagsToFetch = tagsToProfile.filter(tag => !recentlyScannedTags.has(tag));

        console.log(`[PROFILING] Pre-filtered: ${recentlyScannedTags.size} tags scanned in the last 30 minutes skipped. Remaining tags to fetch: ${tagsToFetch.length}`);

        const validRecruits: ValidRecruit[] = [];
        let validCount = 0;
        let newCount = 0;
        let refreshCount = 0;
        let invalidCount = 0;
        
        const profileTasks = tagsToProfile.map(playerTag => async () => {
            logAudit('PROFILING', 'called', { tag: playerTag });
            try {
                const profileResponse = await fetchWithRotation(`/players/${encodeURIComponent(playerTag)}`);
                logAudit('PROFILING', 'run', { tag: playerTag, status: profileResponse.status });
                if (profileResponse.ok) {
                    const rawProfilePayload: unknown = await profileResponse.json();

                    // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                    // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
                    const profileValidation = v.safeParse(RoyalePlayerSchema, rawProfilePayload);

                    logAudit('PROFILING', 'resulted_data', { tag: playerTag });
                    logAudit('PROFILING', 'integrity_checked', { 
                        tag: playerTag,
                        passed: profileValidation.success,
                        details: profileValidation.success ? 'Data shape validated via Valibot' : 'Malformed profile data'
                    });
                    
                    if (profileValidation.success) {
                        const playerProfile = profileValidation.output;

                        if (!playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag) && (playerProfile.trophies || 0) >= requiredTrophies) {
                            const trophies = playerProfile.trophies || 0;
                            const donations = playerProfile.totalDonations || 0;
                            const war = playerProfile.warDayWins || 0;
                            const cards = playerProfile.challengeCardsWon || 0;

                            // Authoritative formula: Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
                            // [DECISION LOG] This formula is the authoritative scoring engine for recruitment potential.
                            const potentialRawScore = (trophies * 1.0) + (donations * 0.1) + ((war + 500) * 20.0);

                            validRecruits.push({
                                player_tag: playerProfile.tag,
                                player_name: playerProfile.name,
                                trophies,
                                donations,
                                cards,
                                war_wins: war,
                                raw_potential_score: potentialRawScore,
                                source: candidates.get(playerTag) || 'UNKNOWN',
                                status: 'ACTIVE'
                            });
                            console.log(`[PROFILER] Admitted ${playerProfile.tag} | trophies=${trophies} war=${war} donations=${donations} rawScore=${potentialRawScore}`);
                            validCount++;
                        } else {
                            console.log(`[PROFILER] Rejected ${playerProfile.tag} | hasClan=${!!playerProfile.clan?.tag} inExclusion=${exclusionSet.has(playerProfile.tag)} trophies=${playerProfile.trophies || 0} required=${requiredTrophies}`);
                            invalidCount++;
                        }
                    } else {
                        invalidCount++;
                    }
                } else {
                    if (profileResponse.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: playerTag });
                        logAudit('PROFILING', 'called', { tag: playerTag, action: 'blacklisted_ghost' });
                        console.log(`[PROFILING] Player ${playerTag} is a ghost (404). Blacklisted.`);
                    } else {
                        console.error(`[PROFILING] Player ${playerTag} fetch failed with HTTP ${profileResponse.status}`);
                    }
                    stats.errors.push(`Profile(${playerTag}): ${profileResponse.status}`);
                    logAudit('PROFILING', 'integrity_checked', { passed: false, details: `HTTP_${profileResponse.status}` });
                    logAudit('PROFILING', 'error', { tag: playerTag, status: profileResponse.status });
                    invalidCount++;
                }
            } catch (profilingError: unknown) {
                const errorMessage = profilingError instanceof Error ? profilingError.message : String(profilingError);
                stats.errors.push(`Profile(${playerTag}): ${errorMessage}`);
                logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('PROFILING', 'error', { tag: playerTag, message: errorMessage });
                console.error(`[PROFILING] Exception while profiling ${playerTag}: ${errorMessage}`);
                invalidCount++;
            }
        });
        
        console.log(`[PROFILING] Batch processing ${tagsToFetch.length} profiles...`);
        await processBatch(profileTasks, 40);
        console.log(`[PROFILING] Batch processing complete. Valid: ${validCount}, Invalid/Filtered: ${invalidCount}`);

        if (validRecruits.length > 0) {
            // Group recruits by their discovery source for accurate attribution
            const bySource = new Map<string, ValidRecruit[]>();
            let maxRpos = -Infinity;
            let minRpos = Infinity;
            const sourceCounts: Record<string, number> = {};

            for (const recruitRow of validRecruits) {
                const recruitSource = recruitRow.source || 'UNKNOWN';
                if (!bySource.has(recruitSource)) bySource.set(recruitSource, []);
                bySource.get(recruitSource)!.push(recruitRow);

                // Track RPoS (Raw Potential Score)
                const score = recruitRow.raw_potential_score || 0;
                if (score > maxRpos) maxRpos = score;
                if (score < minRpos) minRpos = score;

                // Track source counts
                sourceCounts[recruitSource] = (sourceCounts[recruitSource] || 0) + 1;
            }

            // Determine which recruits are truly new vs refreshed
            const { data: rawExistingData } = await supabase
                .schema('drivers')
                .from('recruits')
                .select('player_tag')
                .in('player_tag', validRecruits.map(recruitItem => recruitItem.player_tag));
            
            const existingTags = new Set(rawExistingData?.map(existingRecruit => existingRecruit.player_tag) || []);
            validRecruits.forEach(recruitItem => {
                if (existingTags.has(recruitItem.player_tag)) refreshCount++;
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
                .filter(recruitItem => !existingTags.has(recruitItem.player_tag))
                .map(recruitItem => recruitItem.player_tag);
            
            if (newTags.length > 0) {
                console.error(`[PROFILING] Post-ingestion fate check for ${newTags.length} recruits...`);
                
                let fateResults: v.InferOutput<typeof RecruitFateSchema>[] = [];
                let attempts = 0;
                const maxAttempts = 4; // Total 10s potential delay

                while (attempts < maxAttempts) {
                    attempts++;
                    // Incremental backoff: 1s, 2s, 3s, 4s
                    await new Promise(resolve => setTimeout(resolve, attempts * 1000));

                    try {
                        const { data: rawFateData, error: fateError } = await supabase
                            .rpc('get_recruits_fate', { tags: newTags });

                        if (!fateError && rawFateData && Array.isArray(rawFateData) && rawFateData.length > 0) {
                            // [GUARD] VALIDATION BOUNDARY: Target C [1]
                            // [THREAT:] Unsafe type assertions bypass runtime integrity. Malformed RPC data would crash telemetry logic.
                            const fateValidation = v.safeParse(v.array(RecruitFateSchema), rawFateData);

                            if (fateValidation.success) {
                                fateResults = fateValidation.output;
                                const queuedCount = fateResults.filter(fateEntry => fateEntry.status === 'QUEUE').length;
                                if (queuedCount === 0) {
                                    console.error(`[PROFILING] Fate check converged on attempt ${attempts}`);
                                    break;
                                }
                                console.error(`[PROFILING] Fate check attempt ${attempts}: ${fateResults.length} found, ${queuedCount} still QUEUED...`);
                            } else {
                                console.error(`[PROFILING] Fate validation failed on attempt ${attempts}: ${JSON.stringify(fateValidation.issues)}`);
                            }
                        } else if (fateError) {
                            console.error(`[PROFILING] Fate check attempt ${attempts} error: ${JSON.stringify(fateError)}`);
                        }
                    } catch (fateCheckError: unknown) {
                        const errorMessage = fateCheckError instanceof Error ? fateCheckError.message : String(fateCheckError);
                        console.error(`[PROFILING] Fate check attempt ${attempts} exception: ${errorMessage}`);
                    }
                }

                if (fateResults.length > 0) {
                    // Fetch Top 50 Threshold (lowest score in active pool)
                    const { data: rawThresholdData } = await supabase.rpc('get_top_50_threshold');
                    
                    // [GUARD] VALIDATION BOUNDARY: Database RPC results must be validated.
                    // [THREAT:] Missing or malformed threshold would corrupt Top 50 telemetry reporting.
                    const threshold50 = typeof rawThresholdData === 'number' ? rawThresholdData : 0;

                    stats.new_recruits_active = fateResults.filter(fateEntry => fateEntry.status === 'ACTIVE').length;
                    stats.new_recruits_benched = fateResults.filter(fateEntry => fateEntry.status === 'BENCHED').length;
                    stats.new_recruits_top50 = fateResults.filter(fateEntry => fateEntry.status === 'ACTIVE' && Number(fateEntry.raw_potential_score) >= threshold50).length;
                    
                    console.error(`[PROFILING] Fate Finalized: Active=${stats.new_recruits_active}, Benched=${stats.new_recruits_benched}, Top50=${stats.new_recruits_top50}`);
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
    } catch (profilerException: unknown) {
        const errorMessage = profilerException instanceof Error ? profilerException.message : String(profilerException);
        logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('PROFILING', 'error', { message: errorMessage });
        logAudit('PROFILING', 'terminated', { error: true });
        console.error(`[PROFILING] Fatal exception: ${errorMessage}`);
        throw profilerException;
    }
}
