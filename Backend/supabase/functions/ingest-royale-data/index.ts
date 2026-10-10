// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { executePipeline } from "./pipeline.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { ProtocolError } from "../_shared/errors.ts";
import { normalizeTag } from "../_shared/utils.ts";
import { RoyaleTagSchema } from "../_shared/schemas.ts";
import * as v from "npm:valibot@1.5.0";

/**
 * Supabase Edge Function: ingest-royale-data
 * L5 Control Layer: Public API Entry Point
 */

// [GUARD] VALIDATION BOUNDARY: A caller-supplied CLAN_TAG must match the
// Clash Royale tag format (mirrors the DB's `clan_tag` CHECK constraint)
// before it reaches `p_clan_tag` on any ingestion RPC.
const PayloadSchema = v.object({
    CLAN_TAG: v.optional(RoyaleTagSchema)
});

Deno.serve(async (req) => {
    // Sync secrets from Vault before processing request
    await syncVault();

    return await clinicalServe({
        req,
        supabase,
        bearerToken: CONFIG.INTERNAL_BEARER_TOKEN,
        eventType: 'INGESTION_CYCLE',
        componentId: 'ROYALE_DATA_INGESTOR',
        schema: PayloadSchema,
        handler: async (payload, logAudit, heartbeat) => {
            // [DECISION LOG] Normalize a caller-supplied CLAN_TAG so a case- or
            // prefix-variant tag cannot reach p_clan_tag, consistent with sibling
            // functions (sync-player-cards, fetch-player-battlelog).
            const clanTag = payload.CLAN_TAG ? normalizeTag(payload.CLAN_TAG) : CONFIG.CLAN_TAG;
            let clanSyncExecutionFailed = false;
            const pipelineAudit = (stage: string, action: Parameters<typeof logAudit>[1], details?: unknown) => {
                if (stage === "CLAN_SYNC" && action === "error") clanSyncExecutionFailed = true;
                logAudit(stage, action, details);
            };
            const results = await executePipeline(clanTag, pipelineAudit, heartbeat);
            const requiredWriteStages = ["profile", "members", "race", "warlog"] as const;
            const incompleteRequiredWrites = requiredWriteStages.filter(
                (stage) => results?.[stage]?.success !== true,
            );
            const failedCompletionChecks = [
                ...incompleteRequiredWrites,
                ...(clanSyncExecutionFailed ? ["clan-sync-execution"] : []),
            ];

            if (failedCompletionChecks.length > 0) {
                throw new ProtocolError(
                    "INTERNAL_ERROR",
                    `Required clan persistence incomplete: ${failedCompletionChecks.join(", ")}`,
                );
            }

            return results;
        }
    });
});
