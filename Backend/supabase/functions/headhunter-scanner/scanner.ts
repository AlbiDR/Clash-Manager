// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "./client.ts";
import { ScannerStats, AuditEntry } from "../_shared/types.ts";
import { HeadhunterContextSchema } from "../_shared/schemas.ts";
import * as v from "npm:valibot";
import { runShadowScout } from "./stages/shadow-scout.ts";
import { runTournamentDiscovery } from "./stages/tournament-finder.ts";
import { runProfiler } from "./stages/profiler.ts";
import { runRescan } from "./stages/rescan.ts";

/**
 * @remarks
 * [LAYER 4: APP ORCHESTRATOR]
 * The Headhunter Scanner Orchestrator is the authoritative entry point for the
 * multi-stage recruitment discovery engine. It manages the lifecycle of a scan
 * operation, coordinating between discovery (Shadow, Tournament), profiling,
 * and maintenance (Rescan) stages.
 *
 * It enforces a strict timeout protocol per stage to prevent zombie worker
 * processes and provides real-time telemetry through audit logging and
 * heartbeat mechanisms.
 */

/**
 * Executes the full Headhunter scanning pipeline.
 *
 * @param tournaments - List of tournament tags to scan, or ['AUTO'] for keyword-based discovery.
 * @param logAudit - Telemetry callback for recording stage-specific events and errors.
 * @param heartbeat - Telemetry callback for updating the caller with progressive stats.
 * @returns An aggregated stats object including discovery counts, scan counts, and duration.
 *
 * @throws {Error} If the core execution environment fails (telemetry or database connectivity).
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
        errors: []
    };

    // --- CONTEXT BOOT: FETCH EXCLUSIONS AND THRESHOLDS ---
    const { data: contextDataRaw } = await supabase.rpc('get_headhunter_context');

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // Rationale: Harden raw Supabase data before use to prevent silent failures.
    const contextResult = v.safeParse(HeadhunterContextSchema, contextDataRaw);
    const contextData = contextResult.success ? contextResult.output : { required_trophies: 0, exclusion_tags: [] };

    if (!contextResult.success) {
        logAudit('BOOT', 'error', { message: 'Context validation failed, using defaults', issues: contextResult.issues });
    }

    const requiredTrophies = contextData.required_trophies || 0;
    const exclusionSet = new Set<string>(contextData.exclusion_tags || []);
    const candidates = new Map<string, string>(); // tag -> source

    // --- TIMEOUT HELPER ---
    // [DECISION LOG]: 10-minute timeout per stage prevents a single stalled API
    // request from locking a worker process indefinitely, ensuring slot availability.
    const STAGE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const withTimeout = async (promise: Promise<void>, stageName: string) => {
        const timeout = new Promise<void>((_, reject) => 
            // [THREAT:]: Stage timeouts block worker concurrency. We force rejection to
            // allow the orchestrator to recover and report the failure.
            setTimeout(() => reject(new Error(`Stage ${stageName} timed out after 10m`)), STAGE_TIMEOUT)
        );
        return Promise.race([promise, timeout]);
    };

    // --- DISCOVERY PHASE (S1-S3) ---
    
    // 1. Shadow Scouting
    try {
        // [DECISION LOG]: Pipeline continues even if an individual stage fails (Best-Effort).
        // This ensures that a failure in Shadow Scouting doesn't block Tournament Discovery.
        await withTimeout(runShadowScout(candidates, exclusionSet, stats, logAudit), 'S1_SHADOW_SCOUT');
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        stats.errors.push(`S1_SHADOW_SCOUT: ${errorMessage}`);
        logAudit('SHADOW_SCOUT', 'error', { message: errorMessage });
    }
    // [THREAT:]: Heartbeat failure can lead to data starvation at the UI level
    // if the caller relies on progressive stats for UI hydration.
    await heartbeat('S1_SHADOW_SCOUT', stats);

    // 2. Tournament Discovery
    try {
        if (tournaments.includes("AUTO")) {
            await withTimeout(runTournamentDiscovery(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S2_TOURNAMENT_DISCOVERY');
        }
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        stats.errors.push(`S2_TOURNAMENT_DISCOVERY: ${errorMessage}`);
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: errorMessage });
    }
    // [THREAT:]: Heartbeat failure can lead to data starvation at the UI level.
    await heartbeat('S2_TOURNAMENT_DISCOVERY', stats);

    // 3. Profiling & Ingestion
    try {
        await withTimeout(runProfiler(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S3_PROFILING');
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        stats.errors.push(`S3_PROFILING: ${errorMessage}`);
        logAudit('PROFILING', 'error', { message: errorMessage });
    }
    // [THREAT:]: Heartbeat failure can lead to data starvation at the UI level.
    await heartbeat('S3_PROFILING', stats);

    // --- MAINTENANCE PHASE (S4) ---
    
    // 4. Stale Recruit Re-scan (refresh existing ACTIVE pool, evict clanned players)
    try {
        await withTimeout(runRescan(exclusionSet, requiredTrophies, stats, logAudit), 'S4_RESCAN');
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        stats.errors.push(`S4_RESCAN: ${errorMessage}`);
        logAudit('RESCAN', 'error', { message: errorMessage });
    }
    // [THREAT:]: Heartbeat failure can lead to data starvation at the UI level.
    await heartbeat('S4_RESCAN', stats);

    return {
        ...stats,
        duration_ms: Date.now() - startTime
    };
}
