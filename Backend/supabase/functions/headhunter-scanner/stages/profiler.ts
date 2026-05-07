// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyalePlayerSchema } from "../../_shared/schemas.ts";

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
        const validRecruits: unknown[] = [];
        let validCount = 0;
        let invalidCount = 0;
        
        const profileTasks = tagsToProfile.map(tag => async () => {
            logAudit('PROFILING', 'called', { tag });
            try {
                const profileResponse = await fetchWithRotation(`/players/${encodeURIComponent(tag)}`);
                logAudit('PROFILING', 'run', { tag, status: profileResponse.status });
                if (profileResponse.ok) {
                    const rawPlayerProfile = await profileResponse.json();

                    // [GUARD] VALIDATION BOUNDARY: Target B [1]
                    // THREAT: Malformed player profile from Royale API Proxy.
                    // Rationale: Ensure the player data is structurally sound before applying the score formula.
                    const parsedPlayer = v.safeParse(RoyalePlayerSchema, rawPlayerProfile);

                    logAudit('PROFILING', 'resulted_data', { tag });
                    logAudit('PROFILING', 'integrity_checked', { 
                        tag, 
                        passed: parsedPlayer.success,
                        details: parsedPlayer.success ? 'Data shape validated (Player Profile)' : 'Malformed profile data'
                    });
                    
                    if (parsedPlayer.success) {
                        const playerProfile = parsedPlayer.output;
                        if (!playerProfile.clan?.tag && !exclusionSet.has(playerProfile.tag) && playerProfile.trophies >= requiredTrophies) {
                            const trophies = playerProfile.trophies;
                            const donations = playerProfile.totalDonations;
                            const war = playerProfile.warDayWins;

                            // Authoritative formula: Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
                            const rawScore = (trophies * 1.0) + (donations * 0.1) + ((war + 500) * 20.0);

                            validRecruits.push({
                                tag: playerProfile.tag,
                                name: playerProfile.name,
                                trophies,
                                donations,
                                war,
                                rawScore,
                                source: candidates.get(tag) || 'UNKNOWN'
                            });
                            validCount++;
                        } else {
                            invalidCount++;
                        }
                    } else {
                        invalidCount++;
                    }
                } else {
                    if (profileResponse.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('PROFILING', 'called', { tag, action: 'blacklisted_ghost' });
                        console.log(`[PROFILING] Player ${tag} is a ghost (404). Blacklisted.`);
                    } else {
                        console.error(`[PROFILING] Player ${tag} fetch failed with HTTP ${profileResponse.status}`);
                    }
                    stats.errors.push(`Profile(${tag}): ${profileResponse.status}`);
                    logAudit('PROFILING', 'integrity_checked', { passed: false, details: `HTTP_${profileResponse.status}` });
                    logAudit('PROFILING', 'error', { tag, status: profileResponse.status });
                    invalidCount++;
                }
            } catch (profileFetchException: unknown) {
                const errorMessage = profileFetchException instanceof Error ? profileFetchException.message : String(profileFetchException);
                stats.errors.push(`Profile(${tag}): ${errorMessage}`);
                logAudit('PROFILING', 'integrity_checked', { passed: false, details: errorMessage });
                logAudit('PROFILING', 'error', { tag, message: errorMessage });
                console.error(`[PROFILING] Exception while profiling ${tag}: ${errorMessage}`);
                invalidCount++;
            }
        });
        
        console.log(`[PROFILING] Batch processing ${tagsToProfile.length} profiles...`);
        await processBatch(profileTasks, 20);
        console.log(`[PROFILING] Batch processing complete. Valid: ${validCount}, Invalid/Filtered: ${invalidCount}`);

        if (validRecruits.length > 0) {
            // Group recruits by their discovery source for accurate attribution
            const bySource = new Map<string, unknown[]>();
            for (const recruit of validRecruits as any[]) {
                const src = recruit.source || 'UNKNOWN';
                if (!bySource.has(src)) bySource.set(src, []);
                bySource.get(src)!.push(recruit);
            }

            console.log(`[PROFILING] Ingesting ${validRecruits.length} recruits into raw_scout_logs...`);
            for (const [source, batch] of bySource) {
                const { error: ingestErr } = await supabase.schema('substrate').from('raw_scout_logs').insert({
                    payload: batch,
                    source
                });
                if (ingestErr) {
                    stats.errors.push(`Ingest(${source}): ${ingestErr.message}`);
                    logAudit('PROFILING', 'error', { message: `DB Ingestion Failure (${source})`, details: ingestErr });
                    console.error(`[PROFILING] DB Ingestion Failure (${source}): ${ingestErr.message}`);
                } else {
                    console.log(`[PROFILING] Successfully ingested ${batch.length} recruits from source ${source}`);
                }
            }
            stats.recruits_ingested = validRecruits.length;
        }
        stats.profiles_scanned = tagsToProfile.length;
        logAudit('PROFILING', 'terminated', { scanned: tagsToProfile.length, ingested: validRecruits.length });
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
