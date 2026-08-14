// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase } from "../client.ts";
import { fetchWithRotation } from "../../_shared/muscle.ts";
import { IngestionResult, AuditEntry } from "../../_shared/types.ts";
import * as v from "npm:valibot@1.4.2";
import {
    RoyaleClanSchema,
    createRoyaleFlexibleListSchema,
    RoyaleClanMemberSchema,
    RoyaleRiverRaceSchema,
    RoyaleWarLogItemSchema
} from "../../_shared/schemas.ts";

/**
 * STAGES 2-5: NATIVE CLAN SYNCHRONIZATION
 * ----------------------------------------------------------------------------
 * Rationale: Manages raw ingestion cycles for core clan datasets (Profile,
 * Members, River Race, and War Log) from the official Clash Royale API,
 * validating schema consistency before loading to relational storage.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This function forms the L1/L5 transition layer. It pulls data iteratively,
 * subjects each payload to Valibot schema constraints to prevent corrupting
 * database storage, and pipelines the safe payloads to dedicated Postgres RPCs.
 *
 * Satisfies ADR Section III (Validation Boundaries) by enforcing strict schema
 * parsing of external API payloads prior to database persistence.
 *
 * @param clanTag - The authoritative, normalized Clash Royale clan tag.
 * @param results - Ingestion state aggregator to write cycle success/error statuses.
 * @param logAudit - Auditing delegate for operational and logic intent logs.
 */
export async function runClanSync(
    clanTag: string,
    results: IngestionResult, 
    logAudit: (stage: string, action: AuditEntry['action'], details?: unknown) => void
) {
    const CLAN_PATH = `/clans/${encodeURIComponent(clanTag)}`;

    // [GUARD] VALIDATION BOUNDARY: 'members' and 'warlog' are lists whose items must
    // pass a real item schema, not just "an array of objects" - see the
    // [DECISION LOG] on createRoyaleFlexibleListSchema in royaleSchemas.ts.
    const memberListSchema = createRoyaleFlexibleListSchema(RoyaleClanMemberSchema);
    const warLogListSchema = createRoyaleFlexibleListSchema(RoyaleWarLogItemSchema);

    // [DECISION LOG] syncTasks are defined as a const array to enforce type safety
    // when indexing into the results object and mapping schemas.
    const syncTasks = [
        { key: 'profile', path: CLAN_PATH, table: 'raw_clan_profile', schema: RoyaleClanSchema },
        { key: 'members', path: `${CLAN_PATH}/members`, table: 'raw_clan_members', schema: memberListSchema },
        { key: 'race', path: `${CLAN_PATH}/currentriverrace`, table: 'raw_river_race', schema: RoyaleRiverRaceSchema },
        { key: 'warlog', path: `${CLAN_PATH}/riverracelog?limit=12`, table: 'raw_war_log', schema: warLogListSchema }
    ] as const;

    for (const syncTask of syncTasks) {
        const stageName = `S2_S5_${syncTask.key.toUpperCase()}`;
        logAudit(stageName, 'triggered');

        try {
            logAudit(stageName, 'called', { path: syncTask.path });
            const apiResponse = await fetchWithRotation(syncTask.path);
            logAudit(stageName, 'run', { status: apiResponse.status });

            const stageIngestionResult = results[syncTask.key];

            if (apiResponse.ok) {
                // [THREAT:] The 'any Plague' is closed by explicitly typing raw ingress as unknown.
                const rawRoyalePayload: unknown = await apiResponse.json();

                // [GUARD] VALIDATION BOUNDARY: External API data must match our internal schema.
                // [THREAT:] Prevents database corruption or runtime crashes from unexpected Royale API changes.
                // [DECISION LOG] Every API payload is validated against a strict Valibot schema before being passed to the database RPC.
                const payloadValidation = v.safeParse(syncTask.schema, rawRoyalePayload);

                logAudit(stageName, 'resulted_data');
                logAudit(stageName, 'integrity_checked', { 
                    passed: payloadValidation.success,
                    details: payloadValidation.success ? 'Data shape validated via Valibot' : 'Malformed payload structure'
                });
                
                if (payloadValidation.success) {
                    const validatedPayload: unknown = payloadValidation.output;
                    
                    const ingestionRpcName = syncTask.key === 'profile' ? 'ingest_raw_clan_profile' :
                                   syncTask.key === 'members' ? 'ingest_raw_clan_members' :
                                   syncTask.key === 'race' ? 'ingest_raw_river_race' :
                                   'ingest_raw_war_log';

                    // [THREAT:] Database ingestion failures or RPC execution errors are caught and recorded in the audit log.
                    const { error: databaseError } = await supabase.rpc(ingestionRpcName, {
                        p_clan_tag: clanTag,
                        p_payload: validatedPayload
                    });

                    stageIngestionResult.success = !databaseError;
                    if (databaseError) {
                        stageIngestionResult.error = databaseError.message;
                        logAudit(stageName, 'error', { message: 'DB Ingestion Failure (RPC)', details: databaseError });
                    }
                } else {
                    stageIngestionResult.success = false;
                    stageIngestionResult.error = 'VALIDATION_FAILED';
                    logAudit(stageName, 'error', { message: 'Validation Failed', issues: payloadValidation.issues });
                }
            } else {
                stageIngestionResult.success = false;
                stageIngestionResult.error = `HTTP_${apiResponse.status}`;
                logAudit(stageName, 'integrity_checked', { passed: false, details: `HTTP_${apiResponse.status}` });
                logAudit(stageName, 'error', { status: apiResponse.status });
            }
            logAudit(stageName, 'terminated', { success: stageIngestionResult.success });
        } catch (taskExecutionError: unknown) {
            const errorMessage = taskExecutionError instanceof Error ? taskExecutionError.message : String(taskExecutionError);
            logAudit(stageName, 'integrity_checked', { passed: false, details: errorMessage });
            logAudit(stageName, 'error', { message: errorMessage });

            const stageIngestionResult = results[syncTask.key];
            stageIngestionResult.success = false;
            stageIngestionResult.error = errorMessage;
            logAudit(stageName, 'terminated', { error: true });
        }
    }
}
