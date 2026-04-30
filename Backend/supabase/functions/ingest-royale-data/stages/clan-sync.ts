// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";

/**
 * Stages 2-5: Native Clan Synchronization
 * Synchronizes profile, members, river race, and war log.
 */
export async function runClanSync(
    clanTag: string,
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: any) => void
) {
    const CLAN_PATH = `/clans/${encodeURIComponent(clanTag)}`;
    const clanTasks = [
        { key: 'profile', path: CLAN_PATH, table: 'raw_clan_profile' },
        { key: 'members', path: `${CLAN_PATH}/members`, table: 'raw_clan_members' },
        { key: 'race', path: `${CLAN_PATH}/currentriverrace`, table: 'raw_river_race' },
        { key: 'warlog', path: `${CLAN_PATH}/riverracelog`, table: 'raw_war_log' }
    ] as const;

    for (const stage of clanTasks) {
        const stageName = `S2_S5_${stage.key.toUpperCase()}`;
        logAudit(stageName, 'triggered');
        try {
            logAudit(stageName, 'called', { path: stage.path });
            const res = await fetchWithRotation(stage.path);
            logAudit(stageName, 'run', { status: res.status });
            if (res.ok) {
                let data = await res.json();
                const isValid = !!data && typeof data === 'object';
                logAudit(stageName, 'resulted_data');
                logAudit(stageName, 'integrity_checked', { 
                    passed: isValid, 
                    details: isValid ? 'Data shape validated (Object)' : 'Malformed payload' 
                });
                
                if (isValid) {
                    if (stage.key === 'members' || stage.key === 'warlog') {
                        if (Array.isArray(data)) {
                        data = { items: data };
                        } else if (!data.items) {
                        data = { items: [data] };
                        }
                    }
                    const insertPayload: any = { payload: data };
                    if (stage.key === 'members') {
                        insertPayload.clan_tag = clanTag;
                    }
                    const { error } = await supabase.schema('substrate').from(stage.table).insert(insertPayload);
                    (results as any)[stage.key].success = !error;
                    if (error) {
                        (results as any)[stage.key].error = error.message;
                        logAudit(stageName, 'error', { message: 'DB Ingestion Failure', details: error });
                    }
                }
            } else {
                (results as any)[stage.key].error = `HTTP_${res.status}`;
                logAudit(stageName, 'integrity_checked', { passed: false, details: `HTTP_${res.status}` });
                logAudit(stageName, 'error', { status: res.status });
            }
            logAudit(stageName, 'terminated', { success: (results as any)[stage.key].success });
        } catch (e: any) { 
            logAudit(stageName, 'integrity_checked', { passed: false, details: e.message });
            logAudit(stageName, 'error', { message: e.message });
            (results as any)[stage.key].error = e.message;
            logAudit(stageName, 'terminated', { error: true });
        }
    }
}
