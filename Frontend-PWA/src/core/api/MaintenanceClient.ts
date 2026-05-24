// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createSupabaseClient } from "./SupabaseClient";
import type {
  ApiResponse,
} from "@core/types";

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
 * @returns A Promise resolving to an ApiResponse.
 */
export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('trigger_backend_update');

  if (error) return { success: false, data: null, error: { code: error.code, message: error.message } };
  return { success: true, data: data as { success: boolean; message: string } };
}

/**
 * Registers a PushSubscription for server-side notifications.
 * @param subscription - The browser's PushSubscription object.
 * @returns A Promise resolving to true if successful.
 */
export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.schema('drivers').from('push_subscriptions').insert({
    subscription: JSON.parse(JSON.stringify(subscription))
  });

  return !error;
}
