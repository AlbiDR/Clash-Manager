// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "npm:valibot@1.5.0";
import { clinicalServe } from "../_shared/protocol.ts";
import {
  RATE_LIMIT_IP_MAX_REQUESTS,
  RATE_LIMIT_IP_WINDOW_MS,
} from "../_shared/config.ts";
import { supabase, CONFIG } from "./client.ts";

/**
 * Edge Function: ping
 * L5 Control Layer: Lightweight connectivity handshake for the frontend's network
 * diagnostics panel.
 *
 * @remarks
 * [DECISION LOG] Runs through `clinicalServe` (not a bare `Deno.serve` response) purely
 * to get its already-synced `version` literal in the success envelope for free -- that
 * field is kept current on every release by `validate-project.ts --fix` (see
 * PATHS.protocol). Previously the frontend called `supabase.rpc('ping')` directly
 * against `features.ping()`, a plain Postgres function that only ever returned the text
 * 'pong' with no version, so the Settings panel's "Backend v..." readout had no live
 * value to show and permanently displayed its "0.0" fallback.
 * [SECURITY] Accepts only the anon key as bearer credential: unlike the other
 * anon-reachable functions, there is no privileged `INTERNAL_BEARER_TOKEN` path here,
 * since a version probe carries no sensitive data and needs no cron-triggered caller.
 * The probe still creates telemetry and heartbeat writes, so its public credential is
 * volume-bounded just like the data-bearing public functions. Its CORS contract remains
 * deliberately permissive because the response is public health metadata only.
 */
const PayloadSchema = v.object({});

Deno.serve((request) =>
  clinicalServe({
    req: request,
    supabase,
    bearerToken: CONFIG.SUPABASE_ANON_KEY,
    eventType: "HEALTH_CHECK",
    componentId: "PING",
    schema: PayloadSchema,
    rateLimit: {
      maxRequests: RATE_LIMIT_IP_MAX_REQUESTS,
      windowMs: RATE_LIMIT_IP_WINDOW_MS,
    },
    corsRestricted: false,
    handler: async () => ({}),
  })
);
