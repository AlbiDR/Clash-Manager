// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
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
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('S1_DISCOVERY', 'triggered');
    try {
        const keywords = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];
        // EPHEMERAL: intentionally resets on cold start
        const globalNewRecruits = new Map<string, { name: string, trophies: number }>();
        
        const discoveryTasks = keywords.map(keyword => async () => {
            try {
                const tournamentListResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                if (!tournamentListResponse.ok) return;
                
                const rawTournamentList: unknown = await tournamentListResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in tournament lists.
                const listValidation = v.safeParse(RoyaleTournamentListSchema, rawTournamentList);
                if (!listValidation.success) {
                    logAudit('S1_DISCOVERY', 'error', { keyword, message: 'Tournament list validation failed' });
                    return;
                }

                const tournamentTasks = listValidation.output.items.map((tournamentItem) => async () => {
                    // [DECISION LOG] Skip full tournaments to minimize unnecessary API detail calls.
                    if (tournamentItem.capacity === tournamentItem.maxCapacity) return;

                    try {
                        const tournamentDetailsResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentItem.tag)}`);
                        if (tournamentDetailsResponse.ok) {
                            const rawTournamentDetails: unknown = await tournamentDetailsResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Tournament details must be validated before processing members.
                            // [THREAT:] Silent failure or incorrect data ingestion if memberList shape shifts.
                            const detailsValidation = v.safeParse(RoyaleTournamentSchema, rawTournamentDetails);

                            if (detailsValidation.success) {
                                const details = detailsValidation.output;
                                if (details.membersList.length > 0) {
                                    details.membersList
                                        .filter((member) => !member.clan?.tag)
                                        .forEach((member) => {
                                            globalNewRecruits.set(member.tag, {
                                                name: member.name,
                                                trophies: member.trophies || 0
                                            });
                                        });

                                    await supabase.rpc('report_discovery', { p_player_tag: tournamentItem.tag, p_type: 'TOURNAMENT' });
                                }
                            } else {
                                logAudit('S1_DISCOVERY', 'error', { tag: tournamentItem.tag, message: 'Tournament details validation failed' });
                            }
                        }
                    } catch (discoveryError: unknown) {
                        // Silent fail for individual tournament to maintain pipeline progress
                        const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
                        console.warn(`[S1_DISCOVERY] Individual tournament discovery failure: ${errorMessage}`);
                    }
                });
                
                // Concurrency of 5 for tournament details per keyword
                await processBatch(tournamentTasks, 5);
            } catch (discoveryError: unknown) {
                const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
                logAudit('S1_DISCOVERY', 'error', { keyword, message: errorMessage });
            }
        });
        
        // Concurrency of 3 for keywords (total concurrency ~15)
        await processBatch(discoveryTasks, 3);

        // Batch synchronize all discovered recruits
        if (globalNewRecruits.size > 0) {
            const players = Array.from(globalNewRecruits.entries()).map(([tag, data]) => ({
                player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                player_name: data.name
            }));

            const recruits = Array.from(globalNewRecruits.entries()).map(([tag, data]) => ({
                player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                player_name: data.name,
                trophies: data.trophies,
                source: 'TOURNAMENT_AUTO',
                status: 'ACTIVE'
            }));

            await supabase.rpc('sync_players', { p_players: players });
            const { error: recruitError } = await supabase.rpc('sync_recruits', { p_recruits: recruits });
            
            if (!recruitError) {
                results.discovery.harvested = globalNewRecruits.size;
            } else {
                logAudit('S1_DISCOVERY', 'error', { message: 'Recruit Batch Upsert Failure', details: recruitError });
            }
        }

        logAudit('S1_DISCOVERY', 'terminated', { harvested: results.discovery.harvested });
    } catch (discoveryError: unknown) {
        const errorMessage = discoveryError instanceof Error ? discoveryError.message : String(discoveryError);
        results.discovery.error = errorMessage;
        logAudit('S1_DISCOVERY', 'error', { message: errorMessage });
        logAudit('S1_DISCOVERY', 'terminated', { error: true });
        throw discoveryError;
    }
}
