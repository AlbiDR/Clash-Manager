// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "./client.ts";
import { ScannerStats, AuditEntry } from "../_shared/types.ts";
import * as v from "npm:valibot";
import { HeadhunterContextSchema } from "../_shared/schemas.ts";
import { runShadowScout } from "./stages/shadow-scout.ts";
import { runTournamentDiscovery } from "./stages/tournament-finder.ts";
import { runProfiler } from "./stages/profiler.ts";
import { runRescan } from "./stages/rescan.ts";
import { runGhostPurge } from "./stages/ghost-purge.ts";

/**
 * L4 App: Headhunter Scanner Orchestrator
 * Orchestrates the tournament scan and deep profiling pipeline using modular stage handlers.
 *
 * Stage order:
 *   S0  Ghost Purge      - evict clanned players from the active top-50 before discovery
 *   S1  Shadow Scout     - ingest leads from the clan's war/river race
 *   S2  Tournament Finder- discover candidates from active tournaments
 *   S3  Profiler         - deep-profile all discovered candidates and ingest
 *   S4  Rescan           - refresh stale existing recruits; evict any newly-clanned ones
 */
export async function executeScanner(
    tournaments: string[], 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    heartbeat: (stage: string, currentResults: unknown) => Promise<void>
) {
    const startTime = Date.now();
    const stats: ScannerStats = {
        discovery_targets: 0,
        discovery_shadow: 0,
        discovery_tournament: 0,
        profiles_scanned: 0,
        recruits_ingested: 0,
        rescans_processed: 0,
        ghosts_purged: 0,
        highest_rpos: 0,
        lowest_rpos: 0,
        new_recruits_active: 0,
        new_recruits_benched: 0,
        new_recruits_top50: 0,
        ingested_by_source: {},
        errors: []
    };

    // --- CONTEXT BOOT: FETCH EXCLUSIONS AND THRESHOLDS ---
    const { data: rawContextData, error: contextError } = await supabase.rpc('get_headhunter_context');

    // [GUARD] VALIDATION BOUNDARY: Target C [1]
    // Rationale: Ensure scanner parameters are valid before pipeline execution.
    // [THREAT:] Missing or malformed context would lead to invalid discovery logic.
    const validation = v.safeParse(HeadhunterContextSchema, rawContextData);

    if (!validation.success || contextError) {
        logAudit('CONTEXT_BOOT', 'error', {
            message: 'Failed to fetch or validate headhunter context',
            error: contextError?.message,
            issues: validation.success ? null : validation.issues
        });
        throw new Error('Scanner context initialization failed');
    }

    const contextData = validation.output;
    const requiredTrophies = contextData.required_trophies;
    const exclusionSet = new Set<string>(contextData.exclusion_tags);

    // [DECISION LOG] Candidates map tracks potential recruits discovered across different stages.
    // EPHEMERAL: intentionally resets on cold start
    const candidates = new Map<string, string>(); // tag -> source

    // --- TIMEOUT HELPER ---
    const STAGE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const withTimeout = async <T>(promise: Promise<T>, stageName: string): Promise<T> => {
        const timeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Stage ${stageName} timed out after 10m`)), STAGE_TIMEOUT)
        );
        return Promise.race([promise, timeout]);
    };

    // --- S0: GHOST PURGE (clean house before discovering new leads) ---
    try {
        const evicted = await withTimeout(
            runGhostPurge(exclusionSet, stats, logAudit),
            'S0_GHOST_PURGE'
        );
        stats.ghosts_purged = evicted;
    } catch (ghostPurgeError: unknown) {
        const message = ghostPurgeError instanceof Error ? ghostPurgeError.message : String(ghostPurgeError);
        stats.errors.push(`S0_GHOST_PURGE: ${message}`);
        logAudit('GHOST_PURGE', 'error', { message });
    }
    await heartbeat('S0_GHOST_PURGE', stats);

    // --- DISCOVERY PHASE (S1-S3) ---

    // S1: Shadow Scouting
    try {
        await withTimeout(runShadowScout(candidates, exclusionSet, stats, logAudit), 'S1_SHADOW_SCOUT');
    } catch (shadowScoutError: unknown) {
        const message = shadowScoutError instanceof Error ? shadowScoutError.message : String(shadowScoutError);
        stats.errors.push(`S1_SHADOW_SCOUT: ${message}`);
        logAudit('SHADOW_SCOUT', 'error', { message });
    }
    await heartbeat('S1_SHADOW_SCOUT', stats);

    // S2: Tournament Discovery
    try {
        if (tournaments.includes("AUTO")) {
            await withTimeout(runTournamentDiscovery(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S2_TOURNAMENT_DISCOVERY');
        }
    } catch (tournamentDiscoveryError: unknown) {
        const message = tournamentDiscoveryError instanceof Error ? tournamentDiscoveryError.message : String(tournamentDiscoveryError);
        stats.errors.push(`S2_TOURNAMENT_DISCOVERY: ${message}`);
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message });
    }
    await heartbeat('S2_TOURNAMENT_DISCOVERY', stats);

    // S3: Profiling & Ingestion
    try {
        await withTimeout(runProfiler(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S3_PROFILING');
    } catch (profilingError: unknown) {
        const message = profilingError instanceof Error ? profilingError.message : String(profilingError);
        stats.errors.push(`S3_PROFILING: ${message}`);
        logAudit('PROFILING', 'error', { message });
    }
    await heartbeat('S3_PROFILING', stats);

    // --- MAINTENANCE PHASE (S4) ---

    // S4: Stale Recruit Re-scan (refresh existing ACTIVE pool, evict newly-clanned players)
    try {
        await withTimeout(runRescan(exclusionSet, requiredTrophies, stats, logAudit), 'S4_RESCAN');
    } catch (rescanError: unknown) {
        const message = rescanError instanceof Error ? rescanError.message : String(rescanError);
        stats.errors.push(`S4_RESCAN: ${message}`);
        logAudit('RESCAN', 'error', { message });
    }
    await heartbeat('S4_RESCAN', stats);

    return {
        ...stats,
        duration_ms: Date.now() - startTime
    };
}
