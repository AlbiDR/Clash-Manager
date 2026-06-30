// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createSupabaseClient } from "./SupabaseClient";
import type {
  ApiResponse,
} from "@core/types";
import * as v from "valibot";
import { MaintenanceResponseSchema, PushSubscriptionSchema } from "./MaintenanceSchemas";

/**
 * MAINTENANCE CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for system maintenance and plumbing.
 * Features: Manual Pipeline Triggers, Push Subscription Registration.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

/**
 * Manually triggers the backend data ingestion pipeline.
 *
 * @param target - Optional specific target for the update (e.g., 'roster', 'headhunter').
 * @returns A Promise resolving to an ApiResponse indicating the outcome of the trigger.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Delegates the heavy-lifting of data ingestion to the Supabase backend.
 *
 * @sideeffects
 * - Triggers an asynchronous execution of the backend pipeline.
 */
export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<v.InferOutput<typeof MaintenanceResponseSchema>>> {
  const supabase = createSupabaseClient();
  // [THREAT:] Unvalidated RPC responses from the backend (Target C) can mask
  // transient failures or structural desynchronization.
  // [DECISION LOG] Transitioned to strict Valibot validation using MaintenanceResponseSchema
  // and renamed anemic variable pathogens to prevent runtime crashes.
  const { data: rawUpdateResponse, error: updateError } = await supabase.rpc('trigger_backend_update');

  if (updateError) return { success: false, data: null, error: { code: updateError.code, message: updateError.message } };

  const validation = v.safeParse(MaintenanceResponseSchema, rawUpdateResponse);
  if (!validation.success) {
    console.error("[Maintenance] RPC response validation failed:", validation.issues);
    return { success: false, data: null, error: { code: "VALIDATION_FAILED", message: "Malformed maintenance response" } };
  }

  return { success: true, data: validation.output };
}

/**
 * Registers a PushSubscription for server-side notifications.
 *
 * @param pushSubscriptionCandidate - The browser's PushSubscription object containing endpoint and keys.
 * @returns A Promise resolving to true if the subscription was successfully registered.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Persists the subscription object to the `drivers.push_subscriptions` table for later use by notification workers.
 *
 * @sideeffects
 * - Inserts a new record into the `drivers.push_subscriptions` database table.
 */
export async function subscribeToPush(pushSubscriptionCandidate: PushSubscription): Promise<boolean> {
  const supabase = createSupabaseClient();

  // [THREAT:] Malformed push subscriptions can cause notification worker crashes.
  // [DECISION LOG] Utilizing strict Valibot validation on the serialized JSON
  // before database ingress. Renamed anemic 'subscription' to 'pushSubscriptionCandidate'.
  const rawSubscription = pushSubscriptionCandidate.toJSON();
  const validation = v.safeParse(PushSubscriptionSchema, rawSubscription);

  if (!validation.success) {
    console.warn("[Maintenance] Invalid push subscription rejected:", validation.issues);
    return false;
  }

  const { error: insertionError } = await supabase.schema('drivers').from('push_subscriptions').insert({
    subscription: validation.output
  });

  if (insertionError) {
    console.error("[Maintenance] Push subscription insertion failed:", insertionError);
    return false;
  }

  return true;
}
