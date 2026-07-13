// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import * as v from "valibot";

/**
 * [GUARD] SERVICE WORKER SCHEMAS
 * Rationale: Hardens the background synchronization and push notification boundaries
 * within the Service Worker context.
 */

/**
 * Schema for raw recruit data returned from Supabase REST API during background sync.
 */
export const SwSupabaseRowSchema = v.object({
  s: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
});

/**
 * Schema for the full background sync response payload.
 */
export const SwSupabaseResponseSchema = v.array(SwSupabaseRowSchema);

/**
 * Schema for IndexedDB configuration values.
 */
export const SwConfigSchema = v.object({
  supabaseUrl: v.pipe(v.string(), v.url()),
  supabaseKey: v.pipe(v.string(), v.minLength(1)),
  notificationThreshold: v.pipe(v.number(), v.picklist([50, 75])),
  notificationsEnabled: v.boolean(),
});
