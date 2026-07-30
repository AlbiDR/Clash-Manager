// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "./client.ts";
import { ScannerStats, AuditEntry } from "../_shared/types.ts";
import * as v from "npm:valibot@1.4.2";
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
    const startInstant = Temporal.Now.instant();
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
    const { data: scannerContextRaw, error: scannerContextError } = await supabase.rpc('get_headhunter_context');

    // [GUARD] VALIDATION BOUNDARY: Target C [1]
    // Rationale: Ensure scanner parameters are valid before pipeline execution.
    // [THREAT:] Missing or malformed context would lead to invalid discovery logic.
    const scannerContextIntegrity = v.safeParse(HeadhunterContextSchema, scannerContextRaw);

    if (!scannerContextIntegrity.success || scannerContextError) {
        logAudit('CONTEXT_BOOT', 'error', {
            message: 'Failed to fetch or validate headhunter context',
            error: scannerContextError?.message,
            issues: scannerContextIntegrity.success ? null : scannerContextIntegrity.issues
        });
        throw new Error('Scanner context initialization failed');
    }

    const contextData = scannerContextIntegrity.output;
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
    } catch (ghostPurgeExecutionError: unknown) {
        const message = ghostPurgeExecutionError instanceof Error ? ghostPurgeExecutionError.message : String(ghostPurgeExecutionError);
        stats.errors.push(`S0_GHOST_PURGE: ${message}`);
        logAudit('GHOST_PURGE', 'error', { message });
    }
    await heartbeat('S0_GHOST_PURGE', stats);

    // --- DISCOVERY PHASE (S1-S3) ---

    // S1: Shadow Scouting
    try {
        await withTimeout(runShadowScout(candidates, exclusionSet, stats, logAudit), 'S1_SHADOW_SCOUT');
    } catch (shadowScoutExecutionError: unknown) {
        const message = shadowScoutExecutionError instanceof Error ? shadowScoutExecutionError.message : String(shadowScoutExecutionError);
        stats.errors.push(`S1_SHADOW_SCOUT: ${message}`);
        logAudit('SHADOW_SCOUT', 'error', { message });
    }
    await heartbeat('S1_SHADOW_SCOUT', stats);

    // S2: Tournament Discovery
    try {
        if (tournaments.includes("AUTO")) {
            await withTimeout(runTournamentDiscovery(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S2_TOURNAMENT_DISCOVERY');
        }
    } catch (tournamentDiscoveryExecutionError: unknown) {
        const message = tournamentDiscoveryExecutionError instanceof Error ? tournamentDiscoveryExecutionError.message : String(tournamentDiscoveryExecutionError);
        stats.errors.push(`S2_TOURNAMENT_DISCOVERY: ${message}`);
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message });
    }
    await heartbeat('S2_TOURNAMENT_DISCOVERY', stats);

    // Discovery cap check: the profiler hard-caps at 1000 candidates. If we hit
    // that ceiling, lower-priority sources (tournament) lose candidates silently.
    if (candidates.size >= 1000) {
        const capMessage = `Discovery cap reached: ${candidates.size} candidates found - profiler will truncate to 1000`;
        console.warn(`[SCANNER] ${capMessage}`);
        logAudit('DISCOVERY_CAP', 'integrity_checked', {
            passed: true,
            details: capMessage,
            discovery_shadow: stats.discovery_shadow,
            discovery_tournament: stats.discovery_tournament,
        });
    }

    // S3: Profiling & Ingestion
    try {
        await withTimeout(runProfiler(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S3_PROFILING');
    } catch (profilingExecutionError: unknown) {
        const message = profilingExecutionError instanceof Error ? profilingExecutionError.message : String(profilingExecutionError);
        stats.errors.push(`S3_PROFILING: ${message}`);
        logAudit('PROFILING', 'error', { message });
    }
    await heartbeat('S3_PROFILING', stats);

    // --- MAINTENANCE PHASE (S4) ---

    // S4: Stale Recruit Re-scan (refresh existing ACTIVE pool, evict newly-clanned players)
    try {
        await withTimeout(runRescan(exclusionSet, requiredTrophies, stats, logAudit), 'S4_RESCAN');
    } catch (rescanExecutionError: unknown) {
        const message = rescanExecutionError instanceof Error ? rescanExecutionError.message : String(rescanExecutionError);
        stats.errors.push(`S4_RESCAN: ${message}`);
        logAudit('RESCAN', 'error', { message });
    }
    await heartbeat('S4_RESCAN', stats);

    // --- EPOCH GUARD FEEDBACK ---
    // Report the top-50 outcome to the epoch guard state machine so it can
    // decide whether to arm (top50 = 0) or disarm (top50 >= 1) for this cycle.
    // Non-fatal: a telemetry write failure must never abort the scanner result.
    // [THREAT:] supabase.rpc() RESOLVES with { error }, it does not throw, so the try/catch
    // below is dead code for database failures. Without destructuring the error the epoch-guard
    // feedback write could fail completely silently, leaving the guard on its stale state.
    // [DECISION LOG] The error is destructured and recorded, and the 'terminated' audit entry
    // is gated on success so the epoch guard is never reported as updated when it was not.
    // The catch is retained for genuine transport-level rejections (network/abort).
    try {
        const { error: epochStateError } = await supabase.rpc('update_epoch_state', { p_top50: stats.new_recruits_top50 ?? 0 });
        if (epochStateError) {
            stats.errors.push(`EPOCH_GUARD: ${epochStateError.message}`);
            logAudit('EPOCH_GUARD', 'error', { message: epochStateError.message, details: epochStateError });
            console.error(`[SCANNER] Epoch guard feedback write failed: ${epochStateError.message}`);
        } else {
            logAudit('EPOCH_GUARD', 'terminated', { new_recruits_top50: stats.new_recruits_top50 ?? 0 });
        }
    } catch (epochStateExecutionError: unknown) {
        const message = epochStateExecutionError instanceof Error ? epochStateExecutionError.message : String(epochStateExecutionError);
        stats.errors.push(`EPOCH_GUARD: ${message}`);
        logAudit('EPOCH_GUARD', 'error', { message });
    }

    return {
        ...stats,
        duration_ms: Temporal.Now.instant().since(startInstant).total('milliseconds')
    };
}
