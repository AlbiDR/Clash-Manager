// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage: Profiling & Ingestion
 * Fetches deep profile data for discovered candidates and ingests them into raw logs.
 */
export async function runProfiler(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    requiredTrophies: number,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    const tagsToProfile = [...candidates.keys()].slice(0, 500);
    if (tagsToProfile.length === 0) {
        console.log(`[PROFILING] No candidates to profile. Skipping.`);
        return;
    }

    logAudit('PROFILING', 'triggered', { count: tagsToProfile.length });
    console.log(`[PROFILING] Triggered. Profiling ${tagsToProfile.length} candidates.`);
    try {
        const validRecruits: any[] = [];
        let newCount = 0;
        let refreshCount = 0;
        let invalidCount = 0;
        
        const profileTasks = tagsToProfile.map(tag => async () => {
            logAudit('PROFILING', 'called', { tag });
            try {
                const res = await fetchWithRotation(`/players/${encodeURIComponent(tag)}`);
                logAudit('PROFILING', 'run', { tag, status: res.status });
                if (res.ok) {
                    const p = await res.json();
                    const isValid = !!p && typeof p === 'object' && !!p.tag;
                    logAudit('PROFILING', 'resulted_data', { tag });
                    logAudit('PROFILING', 'integrity_checked', { 
                        tag, 
                        passed: isValid, 
                        details: isValid ? 'Data shape validated (Player Object)' : 'Malformed profile data' 
                    });
                    
                    if (isValid && !p.clan?.tag && !exclusionSet.has(p.tag) && (p.trophies || 0) >= requiredTrophies) {
                        const trophies = p.trophies || 0;
                        const donations = p.totalDonations || 0;
                        const war = p.warDayWins || 0;
                        const cards = p.challengeCardsWon || 0;
                        
                        // Authoritative formula: Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
                        const rawScore = (trophies * 1.0) + (donations * 0.1) + ((war + 500) * 20.0);

                        validRecruits.push({
                            player_tag: p.tag,
                            player_name: p.name,
                            trophies,
                            donations,
                            cards,
                            war_wins: war,
                            raw_potential_score: rawScore,
                            source: candidates.get(tag) || 'UNKNOWN',
                            status: 'ACTIVE'
                        });
                        validCount++;
                    } else {
                        invalidCount++;
                    }
                } else {
                    if (res.status === 404) {
                        await supabase.rpc('report_dead_recruit', { p_player_tag: tag });
                        logAudit('PROFILING', 'called', { tag, action: 'blacklisted_ghost' });
                        console.log(`[PROFILING] Player ${tag} is a ghost (404). Blacklisted.`);
                    } else {
                        console.error(`[PROFILING] Player ${tag} fetch failed with HTTP ${res.status}`);
                    }
                    stats.errors.push(`Profile(${tag}): ${res.status}`);
                    logAudit('PROFILING', 'integrity_checked', { passed: false, details: `HTTP_${res.status}` });
                    logAudit('PROFILING', 'error', { tag, status: res.status });
                    invalidCount++;
                }
            } catch (e: any) { 
                stats.errors.push(`Profile(${tag}): ${e.message}`); 
                logAudit('PROFILING', 'integrity_checked', { passed: false, details: e.message });
                logAudit('PROFILING', 'error', { tag, message: e.message });
                console.error(`[PROFILING] Exception while profiling ${tag}: ${e.message}`);
                invalidCount++;
            }
        });
        
        console.log(`[PROFILING] Batch processing ${tagsToProfile.length} profiles...`);
        await processBatch(profileTasks, 20);
        console.log(`[PROFILING] Batch processing complete. Valid: ${validCount}, Invalid/Filtered: ${invalidCount}`);

        if (validRecruits.length > 0) {
            // Group recruits by their discovery source for accurate attribution
            const bySource = new Map<string, any[]>();
            let maxRpos = -Infinity;
            let minRpos = Infinity;
            const sourceCounts: Record<string, number> = {};

            for (const recruit of validRecruits) {
                const src = recruit.source || 'UNKNOWN';
                if (!bySource.has(src)) bySource.set(src, []);
                bySource.get(src)!.push(recruit);

                // Track RPoS (Raw Potential Score)
                const score = recruit.raw_potential_score || 0;
                if (score > maxRpos) maxRpos = score;
                if (score < minRpos) minRpos = score;

                // Track source counts
                sourceCounts[src] = (sourceCounts[src] || 0) + 1;
            }

            // Determine which recruits are truly new vs refreshed
            const { data: existing } = await supabase
                .schema('drivers')
                .from('recruits')
                .select('player_tag')
                .in('player_tag', validRecruits.map(r => r.player_tag));
            
            const existingTags = new Set(existing?.map(e => e.player_tag) || []);
            validRecruits.forEach(r => {
                if (existingTags.has(r.player_tag)) refreshCount++;
                else newCount++;
            });

            console.log(`[PROFILING] Ingesting ${validRecruits.length} recruits into database...`);
            for (const [source, batch] of bySource) {
                const { error: ingestErr } = await supabase.rpc('sync_recruits', {
                    p_recruits: batch
                });
                if (ingestErr) {
                    stats.errors.push(`Ingest(${source}): ${ingestErr.message}`);
                    logAudit('PROFILING', 'error', { message: `DB Ingestion Failure (${source})`, details: ingestErr });
                    console.error(`[PROFILING] DB Ingestion Failure (${source}): ${ingestErr.message}`);
                } else {
                    console.log(`[PROFILING] Successfully ingested ${batch.length} recruits from source ${source}`);
                }
            }
            
            stats.recruits_ingested = (stats.recruits_ingested || 0) + validRecruits.length;
            stats.new_recruits = (stats.new_recruits || 0) + newCount;
            stats.refreshed_recruits = (stats.refreshed_recruits || 0) + refreshCount;
            stats.highest_rpos = maxRpos === -Infinity ? 0 : Math.round(maxRpos);
            stats.lowest_rpos = minRpos === Infinity ? 0 : Math.round(minRpos);
            stats.ingested_by_source = sourceCounts;
        }
        stats.profiles_scanned = tagsToProfile.length;
        logAudit('PROFILING', 'terminated', { scanned: tagsToProfile.length, ingested: validRecruits.length });
        console.log(`[PROFILING] Terminated smoothly.`);
    } catch (e: any) {
        logAudit('PROFILING', 'integrity_checked', { passed: false, details: e.message });
        logAudit('PROFILING', 'error', { message: e.message });
        logAudit('PROFILING', 'terminated', { error: true });
        console.error(`[PROFILING] Fatal exception: ${e.message}`);
        throw e;
    }
}
