// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleTournamentListSchema, RoyaleTournamentSchema } from "../../_shared/schemas.ts";

/**
 * STAGE 1: NATIVE DISCOVERY (Penta-Stage Protocol)
 *
 * @remarks
 * Orchestrates the initial discovery of potential recruits by scanning open
 * Clash Royale tournaments using a keyword-based rotation. This stage satisfies
 * the "Native Discovery" requirement of the ingestion pipeline.
 *
 * [ARCHITECTURE]
 * - Part of the Layer 4 App Orchestrator.
 * - Enforces Valibot validation boundaries at the external API ingress.
 * - Operates under a time-sliced batch processing model to respect rate limits.
 *
 * [DECISION LOG]
 * - Keyword Rotation: Uses a predefined set of high-frequency tournament keywords
 *   ("cla", "roy", etc.) to maximize discovery yield across different regions/timezones.
 * - Batch Processing: Implements a 5-way parallel keyword search and a 10-way
 *   parallel member hydration to balance discovery speed against Royale API rate limits.
 *
 * @param results - The shared ingestion result object to track harvested recruits.
 * @param logAudit - Telemetry callback for recording stage progress and integrity checks.
 *
 * @sideeffects
 * - READS from the Royale API via `fetchWithRotation`.
 * - WRITES to `drivers.players` (Universal Player Registry) to satisfy FK constraints.
 * - WRITES to `drivers.recruits` (Headhunter Queue) for newly discovered candidates.
 * - WRITES to `substrate.discovery_cache` to prevent redundant scanning of the same tournaments.
 *
 * @throws {Error} Bubbles up critical ingestion failures to the orchestrator.
 */
export async function runDiscovery(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('S1_DISCOVERY', 'triggered');
    try {
        const keywords = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];
        
        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('S1_DISCOVERY', 'called', { keyword });
            try {
                const tournamentListResponse = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                logAudit('S1_DISCOVERY', 'run', { keyword, status: tournamentListResponse.status });
                if (!tournamentListResponse.ok) return;
                
                const rawTournamentList = await tournamentListResponse.json();

                // [GUARD] VALIDATION BOUNDARY: Target B [1]
                // THREAT: Malformed tournament search results could lead to runtime crashes in the discovery loop.
                // Rationale: Harden inbound data via Valibot schema before processing.
                const parsedTournamentList = v.safeParse(RoyaleTournamentListSchema, rawTournamentList);
                const isTournamentListValid = parsedTournamentList.success;

                logAudit('S1_DISCOVERY', 'resulted_data', {
                    keyword,
                    items: isTournamentListValid ? parsedTournamentList.output.items.length : 0
                });

                logAudit('S1_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: isTournamentListValid,
                    details: isTournamentListValid ? 'Data shape validated (Tournament List)' : 'Unexpected data shape'
                });
                
                if (!isTournamentListValid) return;

                const memberTasks = parsedTournamentList.output.items.map((tournament) => async () => {
                    if (tournament.capacity === tournament.maxCapacity) return;
                    try {
                        const tournamentDetailsResponse = await fetchWithRotation(`/tournaments/${encodeURIComponent(tournament.tag)}`);
                        if (tournamentDetailsResponse.ok) {
                            const rawTournamentDetails = await tournamentDetailsResponse.json();

                            // [GUARD] VALIDATION BOUNDARY: Target B [1]
                            // THREAT: Unexpected member list structures can cause silent failures in recruitment logic.
                            // Rationale: Ensure deep tournament metadata is hardened before hydration.
                            const parsedTournamentDetails = v.safeParse(RoyaleTournamentSchema, rawTournamentDetails);
                            const isTournamentDetailsValid = parsedTournamentDetails.success;

                            if (isTournamentDetailsValid) {
                                const validatedTournamentDetails = parsedTournamentDetails.output;
                                if (validatedTournamentDetails.membersList && validatedTournamentDetails.membersList.length > 0) {
                                    const newRecruits = validatedTournamentDetails.membersList
                                        .filter((member) => !member.clan?.tag)
                                        .map((member) => ({
                                            tag: member.tag,
                                            name: member.name,
                                            trophies: member.trophies,
                                            status: 'ACTIVE'
                                        }));

                                    if (newRecruits.length > 0) {
                                        const players = newRecruits.map(recruit => ({
                                            player_tag: recruit.tag.startsWith('#') ? recruit.tag : `#${recruit.tag}`,
                                            player_name: recruit.name
                                        }));

                                        const recruits = newRecruits.map(recruit => ({
                                            player_tag: recruit.tag.startsWith('#') ? recruit.tag : `#${recruit.tag}`,
                                            player_name: recruit.name,
                                            trophies: recruit.trophies,
                                            source: 'TOURNAMENT_AUTO',
                                            status: 'ACTIVE'
                                        }));

                                        // L2 Drivers: Sync to universal player registry first to satisfy FK
                                        await supabase.schema('drivers').from('players').upsert(players, { onConflict: 'player_tag' });

                                        // L2 Drivers: Upsert to recruits queue
                                        const { error: recruitError } = await supabase.schema('drivers').from('recruits').upsert(recruits, { onConflict: 'player_tag' });

                                        if (!recruitError) {
                                            results.discovery.harvested += newRecruits.length;
                                        } else {
                                            logAudit('S1_DISCOVERY', 'error', { message: 'Recruit Upsert Failure', details: recruitError });
                                        }
                                    }
                                }
                                await supabase.schema('substrate').from('discovery_cache').upsert({ player_tag: tournament.tag, type: 'TOURNAMENT' });
                            }
                        }
                    } catch (e: unknown) { /* Silent fail */ }
                });
                await processBatch(memberTasks, 10);
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                logAudit('S1_DISCOVERY', 'error', { keyword, message: errorMessage });
            }
        });
        
        await processBatch(discoveryTasks, 5);
        logAudit('S1_DISCOVERY', 'terminated', { harvested: results.discovery.harvested });
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        results.discovery.error = errorMessage;
        logAudit('S1_DISCOVERY', 'error', { message: errorMessage });
        logAudit('S1_DISCOVERY', 'terminated', { error: true });
        throw e;
    }
}
