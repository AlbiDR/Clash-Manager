// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { withAbortSignal } from "../../_shared/abortSignal.ts";
import { IngestionWorkBudget } from "../work-budget.ts";
import { RecruitWriter } from "../recruit-writer.ts";
import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import {
    DISCOVERY_KEYWORDS,
    CONCURRENCY_DISCOVERY_KEYWORDS,
    CONCURRENCY_DISCOVERY_TOURNAMENTS
} from "../../_shared/config.ts";
import * as v from "npm:valibot@1.5.0";
import { RoyaleTournamentListSchema, RoyaleTournamentSchema } from "../../_shared/schemas.ts";

/**
 * Stage 1: Native Discovery
 * Harvests new recruits from open tournaments.
 *
 * [DECISION LOG] Uses a keyword-based discovery strategy to broad-scan the tournament substrate.
 * [THREAT:] External Royale API data is un-trusted. Every ingress point is guarded by Valibot schemas.
 */
export async function runDiscovery(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    budget?: IngestionWorkBudget
) {
    logAudit('S1_DISCOVERY', 'triggered');
    try {
        const discoveryKeywords = DISCOVERY_KEYWORDS;
        let keywordsAttempted = 0;
        let tournamentsAttempted = 0;
        // [DECISION LOG] EPHEMERAL: intentionally resets on cold start to maintain memory hygiene.
        // [THREAT:] Native Discovery depends on in-memory state during the harvest phase;
        // instance termination will lead to partial harvest loss if not synchronized to DB.
        const writer = new RecruitWriter("TOURNAMENT_AUTO", budget);
        
        const discoveryTasks = discoveryKeywords.map(keyword => async () => {
            try {
                if (budget && !budget.canAdmit()) return;
                keywordsAttempted++;
                const tournamentListApiResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`, undefined, budget?.admissionSignal);
                if (!tournamentListApiResponse.ok) return;
                
                const tournamentListRoyalePayload: unknown = await tournamentListApiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in tournament lists.
                // [DECISION LOG] Ensuring that the tournament list matches the expected schema before processing targets.
                const tournamentListValidation = v.safeParse(RoyaleTournamentListSchema, tournamentListRoyalePayload);
                if (!tournamentListValidation.success) {
                    logAudit('S1_DISCOVERY', 'error', { keyword, message: 'Tournament list validation failed' });
                    return;
                }

                const tournamentTasks = tournamentListValidation.output.items.map((tournamentTarget) => async () => {
                    if (budget && !budget.canAdmit()) return;
                    // [DECISION LOG] Skip full tournaments to minimize unnecessary API detail calls.
                    if (tournamentTarget.capacity === tournamentTarget.maxCapacity) return;

                    try {
                        tournamentsAttempted++;
                        const tournamentDetailsResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTarget.tag)}`, undefined, budget?.admissionSignal);
                        if (tournamentDetailsResponse.ok) {
                            const rawTournamentDetailData: unknown = await tournamentDetailsResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Tournament details must be validated before processing members.
                            // [THREAT:] Silent failure or incorrect data ingestion if memberList shape shifts.
                            // [DECISION LOG] Protecting against structural drift in individual tournament details.
                            const tournamentDetailValidation = v.safeParse(RoyaleTournamentSchema, rawTournamentDetailData);

                            if (tournamentDetailValidation.success) {
                                const tournamentDetails = tournamentDetailValidation.output;
                                if (tournamentDetails.membersList.length > 0) {
                                    await writer.add(tournamentDetails.membersList
                                        .filter(member => !member.clan?.tag)
                                        .map(member => ({ tag: member.tag, name: member.name, trophies: member.trophies || 0 })));


                                    // [THREAT:] supabase.rpc() resolves with { error } instead of
                                    // throwing, so an unchecked call loses the discovery record and
                                    // the same tournament is re-fetched on every subsequent run.
                                    const { error: discoveryReportError } = await withAbortSignal(supabase.rpc('report_discovery', { p_player_tag: tournamentTarget.tag, p_type: 'TOURNAMENT' }), budget?.signal);
                                    if (discoveryReportError) {
                                        logAudit('S1_DISCOVERY', 'error', { tag: tournamentTarget.tag, message: 'Discovery report failed', details: discoveryReportError });
                                    }
                                }
                            } else {
                                logAudit('S1_DISCOVERY', 'error', { tag: tournamentTarget.tag, message: 'Tournament details validation failed' });
                            }
                        }
                    } catch (tournamentDiscoveryError: unknown) {
                        // Silent fail for individual tournament to maintain pipeline progress
                        const errorMessage = tournamentDiscoveryError instanceof Error ? tournamentDiscoveryError.message : String(tournamentDiscoveryError);
                        if (!budget || budget.canAdmit()) console.warn(`[S1_DISCOVERY] Individual tournament discovery failure: ${errorMessage}`);
                    }
                });
                
                // [DECISION LOG] Concurrency of 5 for tournament details per keyword to balance throughput and API rate limits.
                await processBatch(tournamentTasks, CONCURRENCY_DISCOVERY_TOURNAMENTS);
            } catch (keywordDiscoveryError: unknown) {
                const errorMessage = keywordDiscoveryError instanceof Error ? keywordDiscoveryError.message : String(keywordDiscoveryError);
                if (!budget || budget.canAdmit()) logAudit('S1_DISCOVERY', 'error', { keyword, message: errorMessage });
            }
        });
        
        // [DECISION LOG] Concurrency of 3 for keywords (total concurrency ~15) to ensure aggressive but safe harvest.
        await processBatch(discoveryTasks, CONCURRENCY_DISCOVERY_KEYWORDS);

        await writer.finish();
        Object.assign(results.discovery, { keywords_attempted: keywordsAttempted, tournaments_attempted: tournamentsAttempted, deferred: !!budget && !budget.canAdmit() });
        results.discovery.harvested = writer.harvested;
        results.discovery.duplicates = writer.duplicates;
        if (writer.error) {
            results.discovery.error = writer.error;
            logAudit('S1_DISCOVERY', 'error', { message: writer.error });
        }
        logAudit('S1_DISCOVERY', 'terminated', { harvested: results.discovery.harvested });
    } catch (pipelineDiscoveryError: unknown) {
        const errorMessage = pipelineDiscoveryError instanceof Error ? pipelineDiscoveryError.message : String(pipelineDiscoveryError);
        results.discovery.error = errorMessage;
        logAudit('S1_DISCOVERY', 'error', { message: errorMessage });
        logAudit('S1_DISCOVERY', 'terminated', { error: true });
        throw pipelineDiscoveryError;
    }
}
