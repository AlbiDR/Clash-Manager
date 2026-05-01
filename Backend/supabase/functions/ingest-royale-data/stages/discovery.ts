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
        const globalNewRecruits = new Map<string, { name: string, trophies: number }>();
        
        const discoveryTasks = keywords.map(keyword => async () => {
            try {
                const res = await fetchWithRotation(`/tournaments?name=${keyword}&limit=10`);
                if (!res.ok) return;
                
                const data = await res.json();
                if (!data || !Array.isArray(data.items)) return;

                const tournamentTasks = (data.items || []).map((t: any) => async () => {
                    if (t.capacity === t.maxCapacity) return; 
                    try {
                        const deRes = await fetchWithRotation(`/tournaments/${encodeURIComponent(t.tag)}`);
                        if (deRes.ok) {
                            const details = await deRes.json();
                            if (details.membersList && details.membersList.length > 0) {
                                details.membersList
                                    .filter((m: any) => !m.clan?.tag)
                                    .forEach((m: any) => {
                                        globalNewRecruits.set(m.tag, { 
                                            name: m.name, 
                                            trophies: m.trophies || 0 
                                        });
                                    });
                                
                                await supabase.rpc('report_discovery', { p_player_tag: t.tag, p_type: 'TOURNAMENT' });
                            }
                        }
                    } catch (e) { /* Silent fail for individual tournament */ }
                });
                
                // Concurrency of 5 for tournament details per keyword
                await processBatch(tournamentTasks, 5);
            } catch (e: any) { 
                logAudit('S1_DISCOVERY', 'error', { keyword, message: e.message });
            }
        });
        
        // Concurrency of 3 for keywords (total concurrency ~15)
        await processBatch(discoveryTasks, 3);

        // Batch synchronize all discovered recruits
        if (globalNewRecruits.size > 0) {
            const players = Array.from(globalNewRecruits.entries()).map(([tag, data]) => ({
                player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                player_name: data.name
            }));

            const recruits = Array.from(globalNewRecruits.entries()).map(([tag, data]) => ({
                player_tag: tag.startsWith('#') ? tag : `#${tag}`,
                player_name: data.name,
                trophies: data.trophies,
                source: 'TOURNAMENT_AUTO',
                status: 'ACTIVE'
            }));

            await supabase.rpc('sync_players', { p_players: players });
            const { error: recruitError } = await supabase.rpc('sync_recruits', { p_recruits: recruits });
            
            if (!recruitError) {
                results.discovery.harvested = globalNewRecruits.size;
            } else {
                logAudit('S1_DISCOVERY', 'error', { message: 'Recruit Batch Upsert Failure', details: recruitError });
            }
        }

        logAudit('S1_DISCOVERY', 'terminated', { harvested: results.discovery.harvested });
    } catch (e: any) { 
        results.discovery.error = e.message;
        logAudit('S1_DISCOVERY', 'error', { message: e.message });
        logAudit('S1_DISCOVERY', 'terminated', { error: true });
        throw e;
    }
}

