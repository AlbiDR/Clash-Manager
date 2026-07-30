// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { executePipeline } from "./pipeline.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import { normalizeTag } from "../_shared/utils.ts";
import { RoyaleTagSchema } from "../_shared/schemas.ts";
import * as v from "npm:valibot@1.4.2";

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
            return await executePipeline(clanTag, logAudit, heartbeat);
        }
    });
});

