// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation, processBatch } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";

/**
 * Stage 1: Native Discovery
 * Harvests new recruits from open tournaments.
 */
export async function runDiscovery(
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    logAudit('S1_DISCOVERY', 'triggered');
    try {
        const keywords = ["cla", "roy", "gam", "pro", "top", "win", "cas", "lea", "tou", "int"];
        
        const discoveryTasks = keywords.map(keyword => async () => {
            logAudit('S1_DISCOVERY', 'called', { keyword });
            try {
                const res = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                logAudit('S1_DISCOVERY', 'run', { keyword, status: res.status });
                if (!res.ok) return;
                
                const data = await res.json();
                const isValid = data && Array.isArray(data.items);
                logAudit('S1_DISCOVERY', 'resulted_data', { keyword, items: data.items?.length });
                logAudit('S1_DISCOVERY', 'integrity_checked', { 
                    keyword, 
                    passed: isValid, 
                    details: isValid ? 'Data shape validated (Array)' : 'Unexpected data shape' 
                });
                
                if (!isValid) return;

                const memberTasks = (data.items || []).map((t: any) => async () => {
                    if (t.capacity === t.maxCapacity) return; 
                    try {
                        const deRes = await fetchWithRotation(`/tournaments/${encodeURIComponent(t.tag)}`);
                        if (deRes.ok) {
                            const details = await deRes.json();
                            if (details.membersList && details.membersList.length > 0) {
                                const newRecruits = details.membersList
                                    .filter((m: any) => !m.clan?.tag)
                                    .map((m: any) => ({
                                        tag: m.tag, name: m.name, trophies: m.trophies || 0, status: 'ACTIVE'
                                    }));
                                    
                                if (newRecruits.length > 0) {
                                    const players = newRecruits.map(r => ({
                                        player_tag: r.tag.startsWith('#') ? r.tag : `#${r.tag}`,
                                        player_name: r.name
                                    }));
                                    
                                    const recruits = newRecruits.map(r => ({
                                        player_tag: r.tag.startsWith('#') ? r.tag : `#${r.tag}`,
                                        player_name: r.name,
                                        trophies: r.trophies,
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
                                await supabase.schema('substrate').from('discovery_cache').upsert({ player_tag: t.tag, type: 'TOURNAMENT' });
                            }
                        }
                    } catch (e) { /* Silent fail */ }
                });
                await processBatch(memberTasks, 10);
            } catch (e: any) { 
                logAudit('S1_DISCOVERY', 'error', { keyword, message: e.message });
            }
        });
        
        await processBatch(discoveryTasks, 5);
        logAudit('S1_DISCOVERY', 'terminated', { harvested: results.discovery.harvested });
    } catch (e: any) { 
        results.discovery.error = e.message;
        logAudit('S1_DISCOVERY', 'error', { message: e.message });
        logAudit('S1_DISCOVERY', 'terminated', { error: true });
        throw e;
    }
}
