// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot";
import { RoyaleClanSchema, RoyaleFlexibleListSchema, RoyaleRiverRaceSchema } from "../../_shared/schemas.ts";

/**
 * Stages 2-5: Native Clan Synchronization
 * Synchronizes profile, members, river race, and war log.
 */
export async function runClanSync(
    clanTag: string,
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    const CLAN_PATH = `/clans/${encodeURIComponent(clanTag)}`;

    // [DECISION LOG] syncTasks are defined as a const array to enforce type safety
    // when indexing into the results object and mapping schemas.
    const syncTasks = [
        { key: 'profile', path: CLAN_PATH, table: 'raw_clan_profile', schema: RoyaleClanSchema },
        { key: 'members', path: `${CLAN_PATH}/members`, table: 'raw_clan_members', schema: RoyaleFlexibleListSchema },
        { key: 'race', path: `${CLAN_PATH}/currentriverrace`, table: 'raw_river_race', schema: RoyaleRiverRaceSchema },
        { key: 'warlog', path: `${CLAN_PATH}/riverracelog?limit=12`, table: 'raw_war_log', schema: RoyaleFlexibleListSchema }
    ] as const;

    for (const syncTask of syncTasks) {
        const stageName = `S2_S5_${syncTask.key.toUpperCase()}`;
        logAudit(stageName, 'triggered');

        try {
            logAudit(stageName, 'called', { path: syncTask.path });
            const apiResponse = await fetchWithRotation(syncTask.path);
            logAudit(stageName, 'run', { status: apiResponse.status });

            const targetResult = results[syncTask.key];

            if (apiResponse.ok) {
                const rawPayload = await apiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
                const validation = v.safeParse(syncTask.schema, rawPayload);

                logAudit(stageName, 'resulted_data');
                logAudit(stageName, 'integrity_checked', { 
                    passed: validation.success,
                    details: validation.success ? 'Data shape validated via Valibot' : 'Malformed payload structure'
                });
                
                if (validation.success) {
                    const sanitizedPayload: unknown = validation.output;
                    
                    const ingestionRpc = syncTask.key === 'profile' ? 'ingest_raw_clan_profile' :
                                   syncTask.key === 'members' ? 'ingest_raw_clan_members' :
                                   syncTask.key === 'race' ? 'ingest_raw_river_race' :
                                   'ingest_raw_war_log';

                    const { error: dbError } = await supabase.rpc(ingestionRpc, {
                        p_clan_tag: clanTag,
                        p_payload: sanitizedPayload
                    });

                    targetResult.success = !dbError;
                    if (dbError) {
                        targetResult.error = dbError.message;
                        logAudit(stageName, 'error', { message: 'DB Ingestion Failure (RPC)', details: dbError });
                    }
                } else {
                    targetResult.success = false;
                    targetResult.error = 'VALIDATION_FAILED';
                    logAudit(stageName, 'error', { message: 'Validation Failed', issues: validation.issues });
                }
            } else {
                targetResult.success = false;
                targetResult.error = `HTTP_${apiResponse.status}`;
                logAudit(stageName, 'integrity_checked', { passed: false, details: `HTTP_${apiResponse.status}` });
                logAudit(stageName, 'error', { status: apiResponse.status });
            }
            logAudit(stageName, 'terminated', { success: targetResult.success });
        } catch (syncError: unknown) {
            const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
            logAudit(stageName, 'integrity_checked', { passed: false, details: errorMessage });
            logAudit(stageName, 'error', { message: errorMessage });

            const targetResult = results[syncTask.key];
            targetResult.success = false;
            targetResult.error = errorMessage;
            logAudit(stageName, 'terminated', { error: true });
        }
    }
}
