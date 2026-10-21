// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { IngestionWorkBudget } from "./work-budget.ts";
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
 * @param heartbeat - Marks a stage boundary in the audit trail (in memory; persisted once at the end).
 * @returns Consolidated ingestion metrics and diagnostic metadata.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture. Acts as the Layer 4
 * Application Orchestrator, enforcing the linear execution sequence of the
 * ingestion substrate.
 */
export async function executePipeline(
    targetTag: string, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void,
    heartbeat: (stage: string) => Promise<void>,
    invocationBudget?: IngestionWorkBudget
): Promise<IngestionResult> {
    const startInstant = Temporal.Now.instant();
    
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

    const budget = invocationBudget ?? new IngestionWorkBudget();
    const stageTimings: Record<string, number> = {};
    Object.assign(results.diagnostics, { stage_timings_ms: stageTimings });
    const stages = [
        { name: 'S2_S5_CLAN', run: () => runClanSync(targetTag, results, logAudit, budget) },
        { name: 'S6_BATTLES', run: () => runDeepDepth(results, logAudit, budget) },
        { name: 'S1_DISCOVERY', run: () => runDiscovery(results, logAudit, budget) },
    ];
    try {
        for (const stage of stages) {
            if (!budget.canAdmit()) {
                if (stage.name === 'S6_BATTLES') Object.assign(results.battles, { members_deferred: 1, error: 'Member polling was not started before admission closed' });
                if (stage.name === 'S1_DISCOVERY') Object.assign(results.discovery, { deferred: true, reason: 'admission deadline' });
                logAudit(stage.name, 'terminated', { deferred: true, reason: 'admission deadline' });
                continue;
            }
            const startedAt = Date.now();
            try { await stage.run(); }
            catch (error: unknown) {
                logAudit(stage.name === 'S2_S5_CLAN' ? 'CLAN_SYNC' : stage.name, 'error', {
                    message: error instanceof Error ? error.message : String(error),
                });
            }
            await heartbeat(stage.name);
            stageTimings[stage.name] = Date.now() - startedAt;
            logAudit(stage.name, 'terminated', { elapsed_ms: stageTimings[stage.name] });
            budget.throwIfExpired();
        }
    } finally {
        if (!invocationBudget) budget.dispose();
    }

    Object.assign(results.diagnostics, { invocation_elapsed_ms: Date.now() - budget.startedAt });
    results.diagnostics.duration_ms = Temporal.Now.instant().since(startInstant).total('milliseconds');
    return results;
}
