// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot@1.4.2";
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
        const discoveryKeywords = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];
        // [DECISION LOG] EPHEMERAL: intentionally resets on cold start to maintain memory hygiene.
        // [THREAT:] Native Discovery depends on in-memory state during the harvest phase;
        // instance termination will lead to partial harvest loss if not synchronized to DB.
        const globalNewRecruits = new Map<string, { name: string, trophies: number }>();
        
        const discoveryTasks = discoveryKeywords.map(keyword => async () => {
            try {
                const tournamentListResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                if (!tournamentListResponse.ok) return;
                
                const rawTournamentListData: unknown = await tournamentListResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents runtime crashes from unexpected Royale API structure changes in tournament lists.
                // [DECISION LOG] Ensuring that the tournament list matches the expected schema before processing targets.
                const tournamentListValidation = v.safeParse(RoyaleTournamentListSchema, rawTournamentListData);
                if (!tournamentListValidation.success) {
                    logAudit('S1_DISCOVERY', 'error', { keyword, message: 'Tournament list validation failed' });
                    return;
                }

                const tournamentTasks = tournamentListValidation.output.items.map((tournamentTarget) => async () => {
                    // [DECISION LOG] Skip full tournaments to minimize unnecessary API detail calls.
                    if (tournamentTarget.capacity === tournamentTarget.maxCapacity) return;

                    try {
                        const tournamentDetailsResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournamentTarget.tag)}`);
                        if (tournamentDetailsResponse.ok) {
                            const rawTournamentDetailData: unknown = await tournamentDetailsResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Tournament details must be validated before processing members.
                            // [THREAT:] Silent failure or incorrect data ingestion if memberList shape shifts.
                            // [DECISION LOG] Protecting against structural drift in individual tournament details.
                            const tournamentDetailValidation = v.safeParse(RoyaleTournamentSchema, rawTournamentDetailData);

                            if (tournamentDetailValidation.success) {
                                const tournamentDetails = tournamentDetailValidation.output;
                                if (tournamentDetails.membersList.length > 0) {
                                    tournamentDetails.membersList
                                        .filter((tournamentMember) => !tournamentMember.clan?.tag)
                                        .forEach((tournamentMember) => {
                                            globalNewRecruits.set(tournamentMember.tag, {
                                                name: tournamentMember.name,
                                                trophies: tournamentMember.trophies || 0
                                            });
                                        });

                                    await supabase.rpc('report_discovery', { p_player_tag: tournamentTarget.tag, p_type: 'TOURNAMENT' });
                                }
                            } else {
                                logAudit('S1_DISCOVERY', 'error', { tag: tournamentTarget.tag, message: 'Tournament details validation failed' });
                            }
                        }
                    } catch (tournamentDiscoveryError: unknown) {
                        // Silent fail for individual tournament to maintain pipeline progress
                        const errorMessage = tournamentDiscoveryError instanceof Error ? tournamentDiscoveryError.message : String(tournamentDiscoveryError);
                        console.warn(`[S1_DISCOVERY] Individual tournament discovery failure: ${errorMessage}`);
                    }
                });
                
                // [DECISION LOG] Concurrency of 5 for tournament details per keyword to balance throughput and API rate limits.
                await processBatch(tournamentTasks, 5);
            } catch (keywordDiscoveryError: unknown) {
                const errorMessage = keywordDiscoveryError instanceof Error ? keywordDiscoveryError.message : String(keywordDiscoveryError);
                logAudit('S1_DISCOVERY', 'error', { keyword, message: errorMessage });
            }
        });
        
        // [DECISION LOG] Concurrency of 3 for keywords (total concurrency ~15) to ensure aggressive but safe harvest.
        await processBatch(discoveryTasks, 3);

        // Batch synchronize all discovered recruits
        // [THREAT:] Failure to synchronize the player registry before the recruitment registry
        // results in foreign key violations and data loss in the recruitment substrate.
        if (globalNewRecruits.size > 0) {
            const playerRegistryPayload = Array.from(globalNewRecruits.entries()).map(([playerTag, playerInfo]) => ({
                player_tag: playerTag.startsWith('#') ? playerTag : `#${playerTag}`,
                player_name: playerInfo.name
            }));

            const recruitRegistryPayload = Array.from(globalNewRecruits.entries()).map(([playerTag, playerInfo]) => ({
                player_tag: playerTag.startsWith('#') ? playerTag : `#${playerTag}`,
                player_name: playerInfo.name,
                trophies: playerInfo.trophies,
                source: 'TOURNAMENT_AUTO',
                status: 'ACTIVE'
            }));

            const { error: playerRegistryError } = await supabase.rpc('sync_players', { p_players: playerRegistryPayload });
            if (playerRegistryError) {
                logAudit('S1_DISCOVERY', 'error', { message: 'Player Registry Batch Sync Failure', details: playerRegistryError });
            }

            const { error: recruitRegistryError } = await supabase.rpc('sync_recruits', { p_recruits: recruitRegistryPayload });
            
            if (!recruitRegistryError) {
                results.discovery.harvested = globalNewRecruits.size;
            } else {
                logAudit('S1_DISCOVERY', 'error', { message: 'Recruit Registry Batch Sync Failure', details: recruitRegistryError });
            }
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
