// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { executePipeline } from "./pipeline.ts";
import { supabase, CONFIG, syncVault } from "./client.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import * as v from "npm:valibot";

/**
 * Supabase Edge Function: ingest-royale-data
 * L5 Control Layer: Public API Entry Point
 */

const PayloadSchema = v.object({
    CLAN_TAG: v.optional(v.string())
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
            const clanTag = payload.CLAN_TAG || CONFIG.CLAN_TAG;
            return await executePipeline(clanTag, logAudit, heartbeat);
        }
    });
});

