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
 * Implements a "Deferred Operation" pattern: if the network is unavailable,
 * the request is enqueued for background synchronization.
 *
 * @param items - Array of dismissal requests containing player IDs.
 * @returns A Promise resolving to an ApiResponse.
 *
 * @sideeffects
 * - ENQUEUES to `offline_queue` in IndexedDB if offline.
 */
export async function dismissRecruits(
  items: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  // [ADR] Normalize IDs: Ensure all tags have the # prefix to satisfy drivers.recruit_blacklist CHECK constraints.
  const normalizedItems = items.map(item => ({
    ...item,
    id: item.id.startsWith('#') ? item.id : `#${item.id}`
  }));
  const { data, error } = await supabase.rpc('dismiss_recruits', { items: normalizedItems });

  // [DESIGN] CONNECTION REQUIRED: Dismissal requires an active connection.
  // The offline queue has been removed. On any failure, throw immediately so
  // the caller can roll back the optimistic tombstone and inform the user.
  if (error) throw new NetworkError(error.message);

  return { success: true, data: data as DismissResponse };
}

/**
 * Restores one or more dismissed recruits to the active pool.
 *
 * @remarks
 * Implements a "Deferred Operation" pattern: if the network is unavailable,
 * the request is enqueued for background synchronization.
 *
 * @param ids - Array of player tags to restore.
 * @returns A Promise resolving to an ApiResponse.
 *
 * @sideeffects
 * - ENQUEUES to `offline_queue` in IndexedDB if offline.
 */
export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const player_tags = ids.map(id => id.startsWith('#') ? id : `#${id}`);
  const { data, error } = await supabase.rpc('undismiss_recruits', { player_tags });

  // [DESIGN] CONNECTION REQUIRED: Undismissal requires an active connection.
  if (error) throw new NetworkError(error.message);

  return { success: true, data: data as DismissResponse };
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
 * - Layer: Layer 1 (@core) — transport factory only, no business logic.
 * - Callers in Layer 3 (@features) supply the event handlers.
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
        (payload) => {
          const playerTag = (payload.new as { player_tag?: string }).player_tag;
          if (playerTag) onInsert(playerTag);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'drivers', table: 'recruit_blacklist' },
        (payload) => {
          const playerTag = (payload.old as { player_tag?: string }).player_tag;
          if (playerTag) onDelete(playerTag);
        },
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn("[Realtime] Subscription error:", err);
        }
      });

    return () => { supabase.removeChannel(channel); };
  } catch (e) {
    console.warn("[Realtime] Failed to initialize subscription:", e);
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
