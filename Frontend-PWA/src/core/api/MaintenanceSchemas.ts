// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * [GUARD] MAINTENANCE RESPONSE SCHEMA
 * Validates the standard response shape for maintenance RPC procedures.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 *
 * [THREAT:] Unvalidated RPC responses from 'trigger_backend_update' can
 * mask database failures or misrepresent execution status.
 */
export const MaintenanceResponseSchema = v.object({
  success: v.boolean(),
  message: v.string(),
});

/**
 * [GUARD] PUSH SUBSCRIPTION SCHEMA
 * Validates the browser's PushSubscription object before database ingress.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 *
 * [THREAT:] Malformed push subscription payloads can cause notification
 * worker crashes or database storage bloat.
 */
export const PushSubscriptionSchema = v.object({
  endpoint: v.pipe(v.string(), v.url()),
  expirationTime: v.optional(v.nullable(v.number())),
  keys: v.object({
    p256dh: v.string(),
    auth: v.string(),
  }),
});
