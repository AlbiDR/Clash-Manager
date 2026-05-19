// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "@supabase/supabase-js";
import { ref } from "vue";
import type {
  ApiResponse,
  WebAppData,
  PingResponse,
  DismissResponse,
  DismissalRequest,
  Recruit,
  LeaderboardMember,
} from "@core/types";
import { idb } from "../services/StorageService";
import { ProfileInputSchema, SbRosterRowSchema, SbHeadhunterRowSchema } from "./DataSchemas";
import { mapSbRosterRow, mapSbHeadhunterRow } from "./DataMappers";
import * as v from "valibot";

/**
 * SUPABASE CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for the Supabase binary stack.
 * Features: Validation Boundaries, Error Normalization, Cache Brokering.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This module serves as the primary gateway for all remote data operations.
 * It enforces strict validation boundaries (Valibot) at the entry point to
 * ensure Layer 1 domain integrity.
 *
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

export const lastSyncStatus = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V8";

/**
 * Specialized error class for network-level failures.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

// Supabase Configuration
const getSupabaseUrl = () => import.meta.env.VITE_SUPABASE_URL || "";
const getSupabaseKey = () => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

/**
 * Internal factory to create a scoped Supabase client.
 * Configured to target the 'features' schema by default.
 */
export const createSupabaseClient = () => {
    return createClient(getSupabaseUrl(), getSupabaseKey(), {
        db: { schema: 'features' }
    });
};

/**
 * Checks if the Supabase environment variables are present.
 * @returns True if both URL and Key are defined.
 */
export function isConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

/**
 * Retrieves the current Supabase endpoint URL.
 * @returns The URL string or a placeholder if unconfigured.
 */
export function getApiUrl(): string {
  return getSupabaseUrl() || "(not configured)";
}

/**
 * Performs a connectivity handshake with the Supabase backend.
 *
 * @param options - Optional configuration including AbortSignal.
 * @returns A PingResponse indicating success or error.
 */
export async function ping(options?: { signal?: AbortSignal; force?: boolean }): Promise<PingResponse> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.rpc('ping');
    if (error) return { status: 'error', message: error.message };
    return { status: 'success', message: 'Pong' };
  } catch (err) {
    return { status: 'error', message: String(err) };
  }
}

/**
 * Loads the main application dataset from persistent local storage.
 * @returns The cached WebAppData or null if empty.
 */
export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

/**
 * Persists the main application dataset to local storage.
 * @param data - The WebAppData to cache.
 */
export async function saveCache(data: WebAppData): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}

/**
 * Fetches high-fidelity datasets from authoritative Supabase views.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * This function bypasses legacy RPCs to query views directly, enforcing
 * Valibot schema validation on all inbound data.
 *
 * @param options - Fetch configuration including AbortSignal.
 * @returns A Promise resolving to a fully populated WebAppData object.
 * @throws Error if any fetch fails or data validation fails.
 *
 * @sideeffects
 * - WRITES to persistent cache via `saveCache`.
 * - MUTATES `lastSyncStatus`.
 */
export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  if (!isConfigured()) throw new Error("Supabase is not configured");
  
  const supabase = createSupabaseClient();
  const signal = options?.signal || new AbortController().signal;

  // [ADR] Direct View Access: Bypassing the minimal SW-oriented get_pwa_data RPC 
  // to fetch high-fidelity datasets directly from the authoritative feature views.
  const [rosterResponse, headhunterResponse, heartbeatResponse, blacklistResponse] = await Promise.all([
    supabase.from('roster_view').select('*').abortSignal(signal),
    supabase.from('headhunter_view').select('*').limit(250).abortSignal(signal),
    supabase.schema('substrate').from('pipeline_heartbeat').select('last_success_at').eq('component_id', 'ROYALE_DATA_INGESTOR').single().abortSignal(signal),
    supabase.schema('drivers').from('recruit_blacklist').select('player_tag').abortSignal(signal)
  ]);

  if (rosterResponse.error) throw new Error(`Roster Fetch Error: ${rosterResponse.error.message}`);
  if (headhunterResponse.error) throw new Error(`Headhunter Fetch Error: ${headhunterResponse.error.message}`);
  
  // [GUARD] VALIDATION BOUNDARY: Harden external view data before domain mapping.
  const rosterData = v.parse(v.array(SbRosterRowSchema), rosterResponse.data || []);
  const headhunterData = v.parse(v.array(SbHeadhunterRowSchema), headhunterResponse.data || []);
  const blacklistTags = (blacklistResponse.data || []).map((row: any) => row.player_tag ? (row.player_tag.startsWith('#') ? row.player_tag : `#${row.player_tag}`) : '').filter(Boolean);

  const leaderboardMembers: LeaderboardMember[] = rosterData.map(mapSbRosterRow);
  const headhunterRecruits: Recruit[] = headhunterData.map(mapSbHeadhunterRow);
  // SSOT: vars.PLAYER_TAG is injected by deploy-pwa.yml as VITE_PLAYER_TAG at build time.
  const playerTag: string = import.meta.env.VITE_PLAYER_TAG || "";
  
  // Rationale: Use the kernel's ingestion heartbeat as the authoritative data age.
  const timestamp = heartbeatResponse.data?.last_success_at
    ? new Date(heartbeatResponse.data.last_success_at).getTime()
    : Date.now();
  
  const webAppData: WebAppData = {
    lb: leaderboardMembers,
    hh: headhunterRecruits,
    playerTag,
    timestamp,
    dataSource: "SUPABASE",
    remoteTimestamp: timestamp,
    lastCompiled: timestamp,
    lastFetched: timestamp,
    blacklist: blacklistTags,
  };
  
  lastSyncStatus.value = "SUCCESS";
  
  await saveCache(webAppData);
  return webAppData;
}

/**
 * Synchronizes and retrieves a specific player profile via the User Proxy.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Triggers the `sync-player-cards` Edge Function to perform normalization
 * and persistence on the backend before returning a validated profile.
 *
 * @param tag - The unique player tag.
 * @returns A Promise resolving to a validated ProfileInput dataset.
 * @throws Error if the Edge Function call fails.
 */
export async function getPlayerProfile(
  tag: string,
): Promise<v.InferOutput<typeof ProfileInputSchema>> {
  // Call the sync-player-cards Edge Function, which:
  //  1. Fetches the player profile from the Clash Royale API via the key-rotation proxy.
  //  2. Normalizes rarity-relative card levels to the unified 1-16 absolute scale.
  //  3. Upserts the snapshot into features.player_card_snapshots.
  //  4. Returns the profile in ProfileInputSchema format.
  const functionUrl = `${getSupabaseUrl()}/functions/v1/sync-player-cards`;
  const profileResponse = await fetch(functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use the publishable key so the Edge Function's JWT verification passes.
      "Authorization": `Bearer ${getSupabaseKey()}`,
    },
    body: JSON.stringify({ tag }),
  });

  if (!profileResponse.ok) {
    const errorBody = await profileResponse.json().catch(() => ({ error: `HTTP ${profileResponse.status}` }));
    throw new Error(errorBody.error ?? `sync-player-cards failed with status ${profileResponse.status}`);
  }

  const rawProfileData = await profileResponse.json();

  // Merge cards and towerTroops into a single array for the simulation engine.
  // isTowerTroop is already set correctly by the Edge Function.
  const normalizedCards = [
    ...(rawProfileData.cards ?? []),
    ...(rawProfileData.towerTroops ?? []),
  ];

  // [GUARD] VALIDATION BOUNDARY: Enforce schema on Edge Function response before domain use.
  return v.parse(ProfileInputSchema, {
    profile: {
      name: rawProfileData.profile?.name ?? "Unknown",
      tag: rawProfileData.profile?.tag ?? tag,
      kingLevel: rawProfileData.profile?.kingLevel ?? 1,
      xpIntoLevel: rawProfileData.profile?.xpIntoLevel ?? 0,
    },
    cards: normalizedCards,
    inventory: rawProfileData.inventory ?? {
      gold: 0,
      gems: 0,
      wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
    },
  });
}

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
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

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
 * [DIAGNOSTIC] Performs a direct query of the headhunter pool.
 * @returns A Promise resolving to an array of Recruits or null on failure.
 */
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('headhunter_view').select('*').limit(20);
  if (error || !data) return null;
  return data.map(mapSbHeadhunterRow);
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

/**
 * [VOYAGE] Activates a new Clan Voyage event via the features proxy.
 */
export async function initializeVoyage(target: number, start: string, end: string) {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .rpc('initialize_voyage', {
            target_crowns: target,
            start_at: start,
            end_at: end
        });

    if (error) {
        console.error('[Voyage] RPC Execution Error:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
        });
        return { success: false, error: error.message };
    }

    // data is the JSONB object returned by the function
    return { success: true, data };
}

/**
 * Fetches the voyage summary from the SSOT view.
 */
export async function fetchVoyageSummary(): Promise<any | null> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('voyage_summary')
        .select('*')
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('[Voyage] Summary fetch error:', error);
        return null;
    }

    return data;
}

/**
 * Fetches contribution aggregates from the high-resolution ledger view.
 */
export async function fetchVoyageContributions(): Promise<VoyageContribution[]> {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
        .from('voyage_contributions')
        .select('*');

    if (error) {
        console.error('[Voyage] Contributions fetch error:', error);
        return [];
    }

    return (data || []) as VoyageContribution[];
}
