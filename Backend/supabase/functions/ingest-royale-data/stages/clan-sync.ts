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

    const clanTasks = [
        { key: 'profile', path: CLAN_PATH, table: 'raw_clan_profile', schema: RoyaleClanSchema },
        { key: 'members', path: `${CLAN_PATH}/members`, table: 'raw_clan_members', schema: RoyaleFlexibleListSchema },
        { key: 'race', path: `${CLAN_PATH}/currentriverrace`, table: 'raw_river_race', schema: RoyaleRiverRaceSchema },
        { key: 'warlog', path: `${CLAN_PATH}/riverracelog`, table: 'raw_war_log', schema: RoyaleFlexibleListSchema }
    ] as const;

    for (const taskConfig of clanTasks) {
        const stageName = `S2_S5_${taskConfig.key.toUpperCase()}`;
        logAudit(stageName, 'triggered');

        try {
            logAudit(stageName, 'called', { path: taskConfig.path });
            const apiResponse = await fetchWithRotation(taskConfig.path);
            logAudit(stageName, 'run', { status: apiResponse.status });

            if (apiResponse.ok) {
                const rawRoyaleData = await apiResponse.json().catch(() => null);

                // [GUARD] VALIDATION BOUNDARY: Target B [1]
                // Rationale: Harden raw Royale API data before ingesting into substrate.
                // This prevents silent corruption of the raw tables by malformed API responses.
                const parsed = v.safeParse(taskConfig.schema, rawRoyaleData);

                logAudit(stageName, 'resulted_data');
                logAudit(stageName, 'integrity_checked', { 
                    passed: parsed.success,
                    details: parsed.success ? 'Data shape validated' : 'Malformed payload'
                });
                
                if (parsed.success) {
                    let finalPayload = parsed.output;

                    // Normalization for list-based endpoints
                    if (taskConfig.key === 'members' || taskConfig.key === 'warlog') {
                        if (Array.isArray(finalPayload)) {
                            finalPayload = { items: finalPayload };
                        }
                    }

                    const dbPayload: Record<string, unknown> = { payload: finalPayload };
                    if (taskConfig.key === 'members') {
                        dbPayload.clan_tag = clanTag;
                    }

                    const { error: dbError } = await supabase.schema('substrate').from(taskConfig.table).insert(dbPayload);

                    const resultStage = results[taskConfig.key];
                    resultStage.success = !dbError;

                    if (dbError) {
                        resultStage.error = dbError.message;
                        logAudit(stageName, 'error', { message: 'DB Ingestion Failure', details: dbError });
                    }
                } else {
                    results[taskConfig.key].error = 'Validation Failed';
                }
            } else {
                results[taskConfig.key].error = `HTTP_${apiResponse.status}`;
                logAudit(stageName, 'integrity_checked', { passed: false, details: `HTTP_${apiResponse.status}` });
                logAudit(stageName, 'error', { status: apiResponse.status });
            }

            logAudit(stageName, 'terminated', { success: results[taskConfig.key].success });

        } catch (syncError: unknown) {
            const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
            logAudit(stageName, 'integrity_checked', { passed: false, details: errorMessage });
            logAudit(stageName, 'error', { message: errorMessage });
            results[taskConfig.key].error = errorMessage;
            logAudit(stageName, 'terminated', { error: true });
        }
    }
}
