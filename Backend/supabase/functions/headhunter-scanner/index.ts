// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase, CONFIG, syncVault } from "./client.ts";
import { executeScanner } from "./scanner.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import * as v from "npm:valibot@1.4.2";

/**
 * Supabase Edge Function: headhunter-scanner
 * L5 Control Layer: Edge Scanner Orchestration
 */

// [GUARD] VALIDATION BOUNDARY: `tournaments` accepts the "AUTO" sentinel plus
// real tournament tags (see scanner.ts, which only checks `.includes("AUTO")`
// and never reads individual tag content), so items are not tag-format
// checked here - but the array and each element are bounded so a caller
// cannot pass an unbounded payload into the scanner.
const PayloadSchema = v.object({
    tournaments: v.pipe(
        v.array(v.pipe(v.string(), v.maxLength(64))),
        v.maxLength(50, "tournaments array must not exceed 50 entries.")
    )
});

Deno.serve(async (scannerRequest) => {
    // Sync secrets from Vault before processing request
    await syncVault();

    return await clinicalServe({
        req: scannerRequest,
        supabase,
        bearerToken: CONFIG.INTERNAL_BEARER_TOKEN,
        eventType: 'HEADHUNTER_SCAN',
        componentId: 'HEADHUNTER_SCANNER',
        schema: PayloadSchema,
        handler: async (scannerPayload, logAudit, heartbeat) => {
            return await executeScanner(scannerPayload.tournaments, logAudit, heartbeat);
        }
    });
});

