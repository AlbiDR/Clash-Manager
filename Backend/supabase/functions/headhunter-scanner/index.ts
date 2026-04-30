// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { supabase, CONFIG } from "./client.ts";
import { executeScanner } from "./scanner.ts";
import { clinicalServe } from "../_shared/protocol.ts";
import * as v from "npm:valibot";

/**
 * Supabase Edge Function: headhunter-scanner
 * L5 Control Layer: Edge Scanner Orchestration
 */

const PayloadSchema = v.object({
    tournaments: v.array(v.string())
});

Deno.serve(async (req) => {
    return await clinicalServe({
        req,
        supabase,
        bearerToken: CONFIG.INTERNAL_BEARER_TOKEN,
        eventType: 'HEADHUNTER_SCAN',
        componentId: 'HEADHUNTER_SCANNER',
        schema: PayloadSchema,
        handler: async (payload, logAudit, heartbeat) => {
            return await executeScanner(payload.tournaments, logAudit, heartbeat);
        }
    });
});

