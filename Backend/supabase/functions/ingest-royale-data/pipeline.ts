// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase, CONFIG } from "./client.ts";
import { IngestionResult, AuditEntry } from "../_shared/types.ts";
import { runClanSync } from "./stages/clan-sync.ts";
import { runDeepDepth } from "./stages/deep-depth.ts";

/**
 * L4 App: Ingestion Pipeline Orchestrator
 *
 * @remarks
 * This module implements the clinical Penta-Stage synchronization protocol for Royale API ingestion.
 * It coordinates the execution of modular stage handlers (discovery, profile, members, race, warlog, battles)
 * while managing telemetry, heartbeats, and stage timeouts. It resides in the L4 App layer,
 * mediating between L5 Control (protocol) and L2/L3 Substrate/Driver layers.
 */

/**
 * Primary orchestrator for the ingestion pipeline.
 *
 * @param targetTag - The authoritative Royale API tag for the target clan or player.
 * @param logAudit - Telemetry callback for microscopic audit logging (DIP compliant).
 * @param heartbeat - Persistence callback for state-in-flight synchronization with the substrate.
 *
 * @returns A consolidated `IngestionResult` containing success/failure state for each stage.
 *
 * @sideeffects
 * - Triggers microscopic telemetry updates via `logAudit`.
 * - Mutates the `IngestionResult` object across multiple stage executions.
 * - Upserts to `pipeline_heartbeat` and `governance_telemetry` via the `heartbeat` callback.
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
    // DECISION LOG: Stage timeout is set to 10 minutes to accommodate Royale API proxy latency
    // during high-depth battle profile scans (Stage 6) while preventing resource leaks.
    const STAGE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const withTimeout = async (promise: Promise<void>, stageName: string) => {
        const timeout = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Stage ${stageName} timed out after 10m`)), STAGE_TIMEOUT)
        );
        return Promise.race([promise, timeout]);
    };

    // --- EXECUTION SEQUENCE ---
    // THREAT: Data starvation due to upstream API timeouts or malformed responses.
    // Rationale: Each stage is isolated in a try/catch block with its own heartbeat
    // to ensure that a failure in one stage doesn't block telemetry for previous successes.

    // Stages 2-5: Clan Synchronization (Profile, Members, Race, WarLog)
    try {
        await withTimeout(runClanSync(targetTag, results, logAudit), 'S2_S5_CLAN');
    } catch (e: any) {
        logAudit('CLAN_SYNC', 'error', { message: e.message });
    }
    await heartbeat('S2_S5_CLAN', results);

    // Stage 6: Deep Depth
    try {
        await withTimeout(runDeepDepth(results, logAudit), 'S6_BATTLES');
    } catch (e: any) {
        logAudit('DEEP_DEPTH', 'error', { message: e.message });
    }
    await heartbeat('S6_BATTLES', results);

    results.diagnostics.duration_ms = Date.now() - startTime;
    return results;
}

