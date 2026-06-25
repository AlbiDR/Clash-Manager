// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createSupabaseClient, NetworkError } from "./SupabaseClient";
import type {
  ApiResponse,
  DismissResponse,
  DismissalRequest,
  Recruit,
} from "@core/types";
import { mapSbHeadhunterRow } from "./DataMappers";
import * as v from "valibot";
import { DismissResponseSchema } from "./RecruitSchemas";

/**
 * RECRUIT CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for the Headhunter recruitment feature.
 * Features: Dismissal Operations, Blacklist Subscriptions, Direct Scouting.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

/**
 * Dismisses one or more recruits from the recruitment pool.
 *
 * @remarks
 * Requires an active network connection. Normalizes player tags before execution
 * (satisfies ADR Section III: Validation Boundaries).
 *
 * @param dismissalRequests - Array of dismissal requests containing player IDs.
 * @returns A Promise resolving to an ApiResponse.
 * @throws {NetworkError} If the network is unavailable or the RPC fails.
 */
export async function dismissRecruits(
  dismissalRequests: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  // [ADR] Normalize IDs: Ensure all tags have the # prefix to satisfy drivers.recruit_blacklist CHECK constraints.
  const normalizedItems = dismissalRequests.map(item => ({
    ...item,
    id: item.id.startsWith('#') ? item.id : `#${item.id}`
  }));

  // [THREAT:] Unvalidated RPC results can cause logic corruption in the feature layer.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data, error } = await supabase.rpc('dismiss_recruits', { items: normalizedItems });

  // [DESIGN] CONNECTION REQUIRED: Dismissal requires an active connection.
  // The offline queue has been removed. On any failure, throw immediately so
  // the caller can roll back the optimistic tombstone and inform the user.
  if (error) throw new NetworkError(error.message);

  return { success: true, data: v.parse(DismissResponseSchema, data) };
}

/**
 * Restores one or more dismissed recruits to the active pool.
 *
 * @remarks
 * Requires an active network connection. Normalizes player tags before execution
 * (satisfies ADR Section III: Validation Boundaries).
 *
 * @param targetTags - Array of player tags to restore.
 * @returns A Promise resolving to an ApiResponse.
 * @throws {NetworkError} If the network is unavailable or the RPC fails.
 */
export async function undismissRecruits(
  targetTags: string[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const player_tags = targetTags.map(id => id.startsWith('#') ? id : `#${id}`);

  // [THREAT:] Unvalidated RPC results can cause logic corruption in the feature layer.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data, error } = await supabase.rpc('undismiss_recruits', { player_tags });

  // [DESIGN] CONNECTION REQUIRED: Undismissal requires an active connection.
  if (error) throw new NetworkError(error.message);

  return { success: true, data: v.parse(DismissResponseSchema, data) };
}

/**
 * Establishes a Realtime subscription on `drivers.recruit_blacklist`.
 *
 * @remarks
 * Listens for INSERT (cross-device dismissals) and DELETE (undismissals) events.
 * Requires `REPLICA IDENTITY FULL` on the table for DELETE payloads to carry
 * the old row data. Returns a cleanup function that removes the channel.
 *
 * **Architectural Context:**
 * - Layer: Layer 1 (@core). Acts as a transport factory only, providing the
 *   subscription infrastructure. No business logic is implemented here.
 * - Callers in Layer 3 (@features) supply the specific event handlers and logic.
 *
 * @param onInsert - Called with the player_tag when a blacklist row is inserted.
 * @param onDelete - Called with the player_tag when a blacklist row is deleted.
 * @returns Cleanup function; call on component unmount.
 */
export function subscribeToBlacklist(
  onInsert: (playerTag: string) => void,
  onDelete: (playerTag: string) => void,
): () => void {
  const supabase = createSupabaseClient();

  try {
    const channel = supabase
      .channel('cm-blacklist-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'drivers', table: 'recruit_blacklist' },
        (payload: unknown) => {
          // [THREAT:] Unvalidated realtime payloads (Target C) can cause runtime crashes.
          // [DECISION LOG] Replaced implicit 'any' with strict narrowing and validation.
          const raw = payload as { new?: { player_tag?: string } };
          const playerTag = raw.new?.player_tag;
          if (playerTag && typeof playerTag === 'string') onInsert(playerTag);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'drivers', table: 'recruit_blacklist' },
        (payload: unknown) => {
          // [THREAT:] Unvalidated realtime payloads (Target C) can cause runtime crashes.
          const raw = payload as { old?: { player_tag?: string } };
          const playerTag = raw.old?.player_tag;
          if (playerTag && typeof playerTag === 'string') onDelete(playerTag);
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn("[Realtime] Subscription error:", err);
        }
      });

    return () => { supabase.removeChannel(channel); };
  } catch (realtimeSetupError) {
    console.warn("[Realtime] Failed to initialize subscription:", realtimeSetupError);
    return () => {};
  }
}

/**
 * [DIAGNOSTIC] Performs a direct query of the headhunter pool.
 * @returns A Promise resolving to an array of Recruits or null on failure.
 */
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('headhunter_view').select('*').limit(20);
  if (error || !data) return null;
  return data.map(mapSbHeadhunterRow);
}
