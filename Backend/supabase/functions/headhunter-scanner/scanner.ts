// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "./client.ts";
import { ScannerStats, AuditEntry } from "../_shared/types.ts";
import { runShadowScout } from "./stages/shadow-scout.ts";
import { runTournamentDiscovery } from "./stages/tournament-finder.ts";
import { runProfiler } from "./stages/profiler.ts";
import { runRescan } from "./stages/rescan.ts";

/**
 * L4 App: Headhunter Scanner Orchestrator
 * Orchestrates the tournament scan and deep profiling pipeline using modular stage handlers.
 */
export async function executeScanner(
    tournaments: string[], 
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void,
    heartbeat: (stage: string, currentResults: any) => Promise<void>
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
    const { data: contextData } = await supabase.rpc('get_headhunter_context');
    const requiredTrophies = contextData?.required_trophies || 0;
    const exclusionSet = new Set<string>(contextData?.exclusion_tags || []);
    const candidates = new Map<string, string>(); // tag -> source

    // --- TIMEOUT HELPER ---
    const STAGE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const withTimeout = async (promise: Promise<void>, stageName: string) => {
        const timeout = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Stage ${stageName} timed out after 10m`)), STAGE_TIMEOUT)
        );
        return Promise.race([promise, timeout]);
    };

    // --- DISCOVERY PHASE (S1-S3) ---
    
    // 1. Shadow Scouting
    try {
        await withTimeout(runShadowScout(candidates, exclusionSet, stats, logAudit), 'S1_SHADOW_SCOUT');
    } catch (e: any) {
        stats.errors.push(`S1_SHADOW_SCOUT: ${e.message}`);
        logAudit('SHADOW_SCOUT', 'error', { message: e.message });
    }
    await heartbeat('S1_SHADOW_SCOUT', stats);

    // 2. Tournament Discovery
    try {
        if (tournaments.includes("AUTO")) {
            await withTimeout(runTournamentDiscovery(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S2_TOURNAMENT_DISCOVERY');
        }
    } catch (e: any) {
        stats.errors.push(`S2_TOURNAMENT_DISCOVERY: ${e.message}`);
        logAudit('TOURNAMENT_DISCOVERY', 'error', { message: e.message });
    }
    await heartbeat('S2_TOURNAMENT_DISCOVERY', stats);

    // 3. Profiling & Ingestion
    try {
        await withTimeout(runProfiler(candidates, exclusionSet, requiredTrophies, stats, logAudit), 'S3_PROFILING');
    } catch (e: any) {
        stats.errors.push(`S3_PROFILING: ${e.message}`);
        logAudit('PROFILING', 'error', { message: e.message });
    }
    await heartbeat('S3_PROFILING', stats);

    // --- MAINTENANCE PHASE (S4) ---
    
    // 4. Stale Recruit Re-scan (refresh existing ACTIVE pool, evict clanned players)
    try {
        await withTimeout(runRescan(exclusionSet, requiredTrophies, stats, logAudit), 'S4_RESCAN');
    } catch (e: any) {
        stats.errors.push(`S4_RESCAN: ${e.message}`);
        logAudit('RESCAN', 'error', { message: e.message });
    }
    await heartbeat('S4_RESCAN', stats);

    return {
        ...stats,
        duration_ms: Date.now() - startTime
    };
}
