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
import {
  ProfileInputSchema,
  SbRosterRowSchema,
  SbHeadhunterRowSchema,
  OfflineQueueSchema
} from "./DataSchemas";
import * as v from "valibot";

/**
 * L1 Core: Supabase API Client
 *
 * @remarks
 * Authoritative entry point for the Supabase Binary Stack. This client brokers all
 * communication between the PWA and the Supabase backend (Edge Functions and Database Views).
 * It enforces strict validation boundaries using Valibot and handles offline synchronization
 * via an IndexedDB-backed operation queue.
 */

/**
 * Reactive status of the last synchronization attempt.
 */
export const lastSyncStatus = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);

/**
 * Key used for primary data persistence in IndexedDB.
 */
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

/**
 * Custom error class for network-related failures.
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
 * Factory for creating a scoped Supabase client.
 * Defaults to the 'features' schema per ADR Section II.
 */
const createSupabaseClient = () => {
    return createClient(getSupabaseUrl(), getSupabaseKey(), {
        db: { schema: 'features' }
    });
};

/**
 * Checks if the required Supabase environment variables are present.
 * @returns True if configured, false otherwise.
 */
export function isConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

/**
 * Returns the configured Supabase URL for diagnostic purposes.
 * @returns The Supabase URL or a fallback string.
 */
export function getApiUrl(): string {
  return getSupabaseUrl() || "(not configured)";
}

/**
 * Performs a connectivity check against the Supabase backend.
 * @param options - Optional AbortSignal and force refresh flag.
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
 * Loads the application state from the local IndexedDB cache.
 * @returns The cached WebAppData or null if not found.
 */
export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

/**
 * Persists the application state to the local IndexedDB cache.
 * @param data - The WebAppData to save.
 */
export async function saveCache(data: WebAppData): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}

/**
 * Transforms a Supabase roster row into a LeaderboardMember
 *
 * @remarks
 * Implements a strict validation boundary (Target B [1]) to eliminate the 'any Plague'.
 * Rationale: Ensures that malformed Supabase views do not corrupt the internal store.
 */
function mapSbRosterRow(rawRosterRow: unknown): LeaderboardMember {
  const result = v.safeParse(SbRosterRowSchema, rawRosterRow);

  // THREAT: Malformed Supabase view data.
  // Rationale: We fallback to safe defaults to prevent a full UI crash
  // while still allowing partial data to be rendered.
  const row = result.success ? result.output : {
    player_tag: '',
    player_name: 'Unknown',
    trophies: 0,
    performance_score: 0,
    raw_performance_score: 0,
    last_seen_at: null,
    role: '',
    tenure_days: 0,
    last_seen_label: '-',
    stability_index: 0,
    week_fame: 0,
  } as v.InferOutput<typeof SbRosterRowSchema>;

  return {
    id: row.player_tag.replace('#', ''),
    n: row.player_name,
    t: row.trophies,
    performanceScore: row.pes ?? row.performance_score,
    performanceRawScore: row.rpes ?? row.raw_performance_score,
    dt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now(),
    d: {
      role: row.role,
      days: row.tenure_days,
      avg: row.performance_score,
      seen: row.last_seen_label,
      rate: row.stability_index ? `${Math.round(row.stability_index * 100)}%` : '-',
      wfame: row.week_fame,
      hist: '-',
    },
  };
}

/**
 * Transforms a Supabase headhunter row into a Recruit
 *
 * @remarks
 * Implements a strict validation boundary (Target B [1]) to eliminate the 'any Plague'.
 */
function mapSbHeadhunterRow(rawHeadhunterRow: unknown): Recruit {
  const result = v.safeParse(SbHeadhunterRowSchema, rawHeadhunterRow);

  const row = result.success ? result.output : {
    player_tag: '',
    player_name: 'Unknown',
    trophies: 0,
    potential_score: 0,
    raw_potential_score: 0,
    last_seen_at: null,
    donations: 0,
    war_wins: 0,
    longevity_label: '-',
  } as v.InferOutput<typeof SbHeadhunterRowSchema>;

  return {
    id: row.player_tag.replace('#', ''),
    n: row.player_name,
    t: row.trophies,
    potentialScore: row.pos ?? row.potential_score,
    potentialRawScore: row.rpos ?? row.raw_potential_score,
    lastScan: row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now(),
    d: {
      don: row.donations,
      war: row.war_wins,
      ago: row.longevity_label,
      cards: 0,
    },
  };
}

/**
 * Orchestrates the retrieval of all high-fidelity datasets from the backend.
 *
 * @remarks
 * Implements [ADR] Direct View Access, bypassing minimal RPCs to fetch directly
 * from authoritative feature views (`roster_view`, `headhunter_view`).
 *
 * @param options - Configuration for the request including AbortSignal.
 * @returns A fully inflated WebAppData object.
 * @throws Error if Supabase is not configured or network request fails.
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
  const [rosterRes, headhunterRes, heartbeatRes] = await Promise.all([
    supabase.from('roster_view').select('*').abortSignal(signal),
    supabase.from('headhunter_view').select('*').limit(100).abortSignal(signal),
    supabase.from('pipeline_heartbeat').select('last_success_at').eq('component_id', 'ROYALE_DATA_INGESTOR').single().abortSignal(signal)
  ]);

  if (rosterRes.error) throw new Error(`Roster Fetch Error: ${rosterRes.error.message}`);
  if (headhunterRes.error) throw new Error(`Headhunter Fetch Error: ${headhunterRes.error.message}`);
  
  const lb: LeaderboardMember[] = (rosterRes.data || []).map(mapSbRosterRow);
  const hh: Recruit[] = (headhunterRes.data || []).map(mapSbHeadhunterRow);
  
  // DECISION LOG: Authoritative Data Age
  // Rationale: Use the kernel's ingestion heartbeat as the authoritative data age
  // instead of the client's current time to ensure consistency across the monorepo.
  const timestamp = heartbeatRes.data?.last_success_at 
    ? new Date(heartbeatRes.data.last_success_at).getTime() 
    : Date.now();
  
  const webAppData: WebAppData = {
    lb,
    hh,
    playerTag: "",
    timestamp,
    dataSource: "SUPABASE",
    remoteTimestamp: timestamp,
    lastCompiled: timestamp,
    lastFetched: timestamp,
  };
  
  lastSyncStatus.value = "SUCCESS";
  
  await saveCache(webAppData);
  return webAppData;
}

/**
 * Retrieves a detailed player profile from the roster view.
 *
 * @param tag - The Clash Royale player tag (with or without #).
 * @returns A validated ProfileInputSchema object.
 * @throws Error if profile is not found or fails validation.
 */
export async function getPlayerProfile(
  tag: string,
): Promise<v.InferOutput<typeof ProfileInputSchema>> {
  const supabase = createSupabaseClient();
  const playerTag = tag.startsWith('#') ? tag : `#${tag}`;
  const { data: rawProfileData, error } = await supabase.from('roster_view').select('*').eq('player_tag', playerTag).single();
  
  if (error) throw new Error(error.message);
  if (!rawProfileData) throw new Error("Profile not found");

  // [GUARD] VALIDATION BOUNDARY: Target B [1]
  // Rationale: Harden raw Supabase data before transforming to internal profile shape.
  const result = v.safeParse(SbRosterRowSchema, rawProfileData);
  if (!result.success) {
    throw new Error(`Profile data validation failed: ${result.issues[0].message}`);
  }

  const profileRow = result.output;
  
  return {
    profile: {
      name: profileRow.player_name,
      tag: profileRow.player_tag,
      kingLevel: profileRow.exp_level,
      xpIntoLevel: 0
    },
    cards: [],
    inventory: { gold: 0, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } }
  };
}

/**
 * Dismisses recruits by updating their status in the backend.
 *
 * @remarks
 * Implements a deferred operations pattern. Transient network errors trigger
 * enqueuing into the offline_queue for eventual consistency.
 *
 * @param items - Array of dismissal payloads containing player tags and reasons.
 * @returns ApiResponse with dismissal stats.
 * @throws NetworkError on non-transient failures.
 */
export async function dismissRecruits(
  items: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('dismiss_recruits', { items });
  
  if (error) {
    // DECISION LOG: Transient Error Recovery
    // Check if we should enqueue for background retry (PGRST301 is usually a timeout/abort)
    const isTransient = error.message.includes("fetch") || error.code === "PGRST301";
    if (isTransient) {
      const unvalidatedOfflineQueue = (await idb.get<unknown[]>("offline_queue")) || [];
      const validationResult = v.safeParse(OfflineQueueSchema, unvalidatedOfflineQueue);

      // THREAT: Corrupted persistence layer poisoning the retry queue.
      // Rationale: We reset the queue if it's malformed to prevent broken operations
      // from being replayed indefinitely.
      const offlineOperationQueue = validationResult.success ? validationResult.output : [];

      offlineOperationQueue.push({
        type: 'RECRUIT_DISMISSAL',
        items: items.map(item => ({ id: item.id, score: item.score })),
        timestamp: Date.now()
      });

      await idb.set("offline_queue", offlineOperationQueue);
      return { success: true, data: { success: true, count: items.length, message: "Enqueued" } };
    }
    throw new NetworkError(error.message);
  }
  
  return { success: true, data: data as DismissResponse };
}

/**
 * Reverts recruit dismissals.
 *
 * @param ids - Array of player tags to undismiss.
 * @returns ApiResponse with restoration stats.
 */
export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const player_tags = ids.map(id => id.startsWith('#') ? id : `#${id}`);
  const { data, error } = await supabase.rpc('undismiss_recruits', { player_tags });
  
  if (error) {
    // DECISION LOG: Offline Resilience
    const isTransient = error.message.includes("fetch") || error.code === "PGRST301";
    if (isTransient) {
      const unvalidatedOfflineQueue = (await idb.get<unknown[]>("offline_queue")) || [];
      const validationResult = v.safeParse(OfflineQueueSchema, unvalidatedOfflineQueue);

      // THREAT: Persistence corruption in recovery queue.
      const offlineOperationQueue = validationResult.success ? validationResult.output : [];

      offlineOperationQueue.push({
        type: 'RECRUIT_RESTORATION',
        ids: player_tags,
        timestamp: Date.now()
      });

      await idb.set("offline_queue", offlineOperationQueue);
      return { success: true, data: { success: true, count: ids.length, message: "Enqueued" } };
    }
    throw new NetworkError(error.message);
  }
  
  return { success: true, data: data as DismissResponse };
}

/**
 * Triggers a background update of the ingestion pipeline.
 * @param target - Optional target identifier for the update.
 * @returns Status of the trigger request.
 */
export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('trigger_backend_update');
  
  if (error) return { success: false, data: null, error: { code: error.code, message: error.message } };

  // THREAT: The "any Plague".
  // Rationale: Casting to the explicit return type defined in the function signature.
  return { success: true, data: data as { success: boolean; message: string } };
}

/**
 * Fetches a limited set of recruits directly from the headhunter view.
 * Useful for lightweight scans or diagnostic checks.
 * @returns Array of Recruit objects or null on failure.
 */
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('headhunter_view').select('*').limit(20);
  if (error || !data) return null;
  return data.map(mapSbHeadhunterRow);
}

/**
 * Registers a PWA push subscription in the backend.
 * @param subscription - The native PushSubscription object.
 * @returns True if successfully registered.
 */
export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from('push_subscriptions').insert({
    subscription: JSON.parse(JSON.stringify(subscription))
  });
  
  return !error;
}
