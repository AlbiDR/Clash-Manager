// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { ShadowTargetSchema } from "../../_shared/schemas.ts";

/**
 * Stage: Shadow Scouting
 * Discovers potential recruits from recent battle logs of known players.
 */
export async function runShadowScout(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    logAudit('SHADOW_SCOUT', 'triggered');
    console.log(`[SHADOW_SCOUT] Triggered. Candidates map size: ${candidates.size}, Exclusion set size: ${exclusionSet.size}`);
    try {
        logAudit('SHADOW_SCOUT', 'called');
        console.log(`[SHADOW_SCOUT] Fetching shadow discovery targets via RPC...`);
        const { data: rawShadowTargets, error: shadowError } = await supabase
            .rpc('get_shadow_discovery_targets', { p_limit: 50 });
        
        logAudit('SHADOW_SCOUT', 'run', { count: Array.isArray(rawShadowTargets) ? rawShadowTargets.length : 0, error: shadowError });
        if (!shadowError && rawShadowTargets) {
            console.log(`[SHADOW_SCOUT] Found ${Array.isArray(rawShadowTargets) ? rawShadowTargets.length : 0} potential shadow targets. Validating...`);

            // [GUARD] VALIDATION BOUNDARY: Target B [1]
            // Rationale: Ensure RPC results match the expected domain shape before processing.
            // THREAT: Malformed database view or RPC return could cause runtime errors in the loop.
            const shadowValidation = v.safeParse(v.array(ShadowTargetSchema), rawShadowTargets);
            
            logAudit('SHADOW_SCOUT', 'resulted_data', {
                count: shadowValidation.success ? shadowValidation.output.length : 0,
                issues: shadowValidation.success ? null : shadowValidation.issues
            });
            logAudit('SHADOW_SCOUT', 'integrity_checked', { 
                passed: shadowValidation.success,
                details: shadowValidation.success ? 'Data shape validated (ShadowTarget array)' : 'Unexpected RPC data shape',
                issues: shadowValidation.success ? null : shadowValidation.issues
            });

            if (shadowValidation.success) {
                let addedCount = 0;
                shadowValidation.output.forEach((shadowTarget) => {
                    // [DECISION LOG] Candidates are only added if they are not in the exclusion set
                    // (e.g., family clan members or already clanned players tracked by the system).
                    // [THREAT:] Processing excluded tags would waste discovery quota and result
                    // in redundant API calls in the Profiler stage.
                    if (!exclusionSet.has(shadowTarget.opponent_player_tag)) {
                        candidates.set(shadowTarget.opponent_player_tag, "SHADOW");
                        stats.discovery_targets++;
                        if (stats.discovery_shadow !== undefined) stats.discovery_shadow++;
                        addedCount++;
                    }
                });
                console.log(`[SHADOW_SCOUT] Added ${addedCount} new shadow candidates (filtered out ${shadowValidation.output.length - addedCount} via exclusion set)`);
            }
        } else {
            console.error(`[SHADOW_SCOUT] RPC error or no data: ${shadowError?.message || 'Unknown RPC error'}`);
            logAudit('SHADOW_SCOUT', 'integrity_checked', { passed: false, details: shadowError?.message || 'Unknown RPC error' });
        }
        logAudit('SHADOW_SCOUT', 'terminated');
        console.log(`[SHADOW_SCOUT] Terminated smoothly.`);
    } catch (shadowScoutException: unknown) {
        const errorMessage = shadowScoutException instanceof Error ? shadowScoutException.message : String(shadowScoutException);
        stats.errors.push(`ShadowScout: ${errorMessage}`);
        logAudit('SHADOW_SCOUT', 'integrity_checked', { passed: false, details: errorMessage });
        logAudit('SHADOW_SCOUT', 'error', { message: errorMessage });
        logAudit('SHADOW_SCOUT', 'terminated', { error: true });
        console.error(`[SHADOW_SCOUT] Fatal exception: ${errorMessage}`);
    }
}
