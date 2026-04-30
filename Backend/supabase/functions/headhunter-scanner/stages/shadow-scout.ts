// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { ScannerStats, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage: Shadow Scouting
 * Discovers potential recruits from recent battle logs of known players.
 */
export async function runShadowScout(
    candidates: Map<string, string>,
    exclusionSet: Set<string>,
    stats: ScannerStats,
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    logAudit('SHADOW_SCOUT', 'triggered');
    console.log(`[SHADOW_SCOUT] Triggered. Candidates map size: ${candidates.size}, Exclusion set size: ${exclusionSet.size}`);
    try {
        logAudit('SHADOW_SCOUT', 'called');
        console.log(`[SHADOW_SCOUT] Fetching shadow discovery targets via RPC...`);
        const { data: shadows, error: sErr } = await supabase
            .rpc('get_shadow_discovery_targets', { p_limit: 50 });
        
        logAudit('SHADOW_SCOUT', 'run', { count: shadows?.length, error: sErr });
        if (!sErr && shadows) {
            console.log(`[SHADOW_SCOUT] Found ${shadows.length} potential shadow targets`);
            let validShadows = 0;
            shadows.forEach((s: any) => {
                if (!exclusionSet.has(s.opponent_player_tag)) {
                    candidates.set(s.opponent_player_tag, "SHADOW");
                    stats.discovery_targets++;
                    if (stats.discovery_shadow !== undefined) stats.discovery_shadow++;
                    validShadows++;
                }
            });
            console.log(`[SHADOW_SCOUT] Added ${validShadows} new shadow candidates (filtered out ${shadows.length - validShadows} via exclusion set)`);
            
            const isValid = Array.isArray(shadows);
            logAudit('SHADOW_SCOUT', 'resulted_data', { count: shadows.length });
            logAudit('SHADOW_SCOUT', 'integrity_checked', { 
                passed: isValid, 
                details: isValid ? 'Data shape validated (Array)' : 'Unexpected data shape' 
            });
        } else {
            console.error(`[SHADOW_SCOUT] RPC error or no data: ${sErr?.message || 'Unknown RPC error'}`);
            logAudit('SHADOW_SCOUT', 'integrity_checked', { passed: false, details: sErr?.message || 'Unknown RPC error' });
        }
        logAudit('SHADOW_SCOUT', 'terminated');
        console.log(`[SHADOW_SCOUT] Terminated smoothly.`);
    } catch (e: any) { 
        stats.errors.push(`ShadowScout: ${e.message}`); 
        logAudit('SHADOW_SCOUT', 'integrity_checked', { passed: false, details: e.message });
        logAudit('SHADOW_SCOUT', 'error', { message: e.message }); 
        logAudit('SHADOW_SCOUT', 'terminated', { error: true });
        console.error(`[SHADOW_SCOUT] Fatal exception: ${e.message}`);
    }
}
