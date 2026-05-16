// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase, CONFIG } from "./client.ts";
import { IngestionResult, AuditEntry } from "../_shared/types.ts";
import { runDiscovery } from "./stages/discovery.ts";
import { runClanSync } from "./stages/clan-sync.ts";
import { runDeepDepth } from "./stages/deep-depth.ts";

/**
 * L4 App: Ingestion Pipeline Orchestrator
 *
 * Orchestrates the clinical Penta-Stage synchronization protocol using modular stage handlers.
 *
 * @param targetTag - The authoritative Clash Royale tag for the target clan.
 * @param logAudit - Telemetry sink for clinical audit logs.
 * @param heartbeat - Persistence hook for intermediate pipeline state.
 * @returns Consolidated ingestion metrics and diagnostic metadata.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture. Acts as the Layer 4
 * Application Orchestrator, enforcing the linear execution sequence of the
 * ingestion substrate.
 */
export async function executePipeline(
    targetTag: string, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void,
    heartbeat: (stage: string, currentResults: any) => Promise<void>
): Promise<IngestionResult> {
    const startTime = Date.now();
    
    const results: IngestionResult = { 
        discovery: { harvested: 0, duplicates: 0 },
        profile: { success: false }, 
        members: { success: false }, 
        race: { success: false }, 
        warlog: { success: false }, 
        battles: { success: false },
        diagnostics: { 
            clan_tag: targetTag,
            duration_ms: 0
        }
    };

    // --- TIMEOUT HELPER ---
    // [DECISION LOG] 10-minute ceiling per stage to prevent zombie execution
    // in Edge Function environments where wall-clock time is billed.
    const STAGE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

    /**
     * Enforces a hard time boundary on stage execution.
     * [THREAT:] Prevents a single hanging API call or logic block from
     * exhausting the global function runtime limit (typically 15-30m).
     */
    const withTimeout = async (promise: Promise<void>, stageName: string) => {
        const timeout = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Stage ${stageName} timed out after 10m`)), STAGE_TIMEOUT)
        );
        return Promise.race([promise, timeout]);
    };

    // --- EXECUTION SEQUENCE ---
    
    // Stage 1: Discovery (Native Discovery via Tournaments)
    // [DECISION LOG] Harvests fresh recruits from the tournament substrate
    // before syncing the primary clan target.
    try {
        await withTimeout(runDiscovery(results, logAudit), 'S1_DISCOVERY');
    } catch (e: any) {
        logAudit('S1_DISCOVERY', 'error', { message: e.message });
    }
    await heartbeat('S1_DISCOVERY', results);

    // Stages 2-5: Clan Synchronization (Profile, Members, Race, WarLog)
    // [DECISION LOG] Unified stage for clan-specific domain synchronization.
    try {
        await withTimeout(runClanSync(targetTag, results, logAudit), 'S2_S5_CLAN');
    } catch (e: any) {
        logAudit('CLAN_SYNC', 'error', { message: e.message });
    }
    await heartbeat('S2_S5_CLAN', results);

    // Stage 6: Deep Depth (Battle Logs)
    // [DECISION LOG] Final enrichment stage for competitive battle history.
    try {
        await withTimeout(runDeepDepth(results, logAudit), 'S6_BATTLES');
    } catch (e: any) {
        logAudit('DEEP_DEPTH', 'error', { message: e.message });
    }
    await heartbeat('S6_BATTLES', results);

    results.diagnostics.duration_ms = Date.now() - startTime;
    return results;
}


