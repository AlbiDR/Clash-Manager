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
import * as v from "valibot";

export const lastSyncStatus = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

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

const createSupabaseClient = () => {
    return createClient(getSupabaseUrl(), getSupabaseKey(), {
        db: { schema: 'features' }
    });
};

export function isConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function getApiUrl(): string {
  return getSupabaseUrl() || "(not configured)";
}

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

export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

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
  
  // Rationale: Use the kernel's ingestion heartbeat as the authoritative data age.
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

export async function dismissRecruits(
  items: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('dismiss_recruits', { items });
  
  if (error) {
    // Check if we should enqueue for background retry
    const isTransient = error.message.includes("fetch") || error.code === "PGRST301";
    if (isTransient) {
      const queue = (await idb.get<any[]>("offline_queue")) || [];
      queue.push({ type: 'RECRUIT_DISMISSAL', items, timestamp: Date.now() });
      await idb.set("offline_queue", queue);
      return { success: true, data: { success: true, count: items.length, message: "Enqueued" } };
    }
    throw new NetworkError(error.message);
  }
  
  return { success: true, data: data as DismissResponse };
}

export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  const supabase = createSupabaseClient();
  const player_tags = ids.map(id => id.startsWith('#') ? id : `#${id}`);
  const { data, error } = await supabase.rpc('undismiss_recruits', { player_tags });
  
  if (error) {
    const isTransient = error.message.includes("fetch") || error.code === "PGRST301";
    if (isTransient) {
      const queue = (await idb.get<any[]>("offline_queue")) || [];
      queue.push({ type: 'RECRUIT_RESTORATION', ids: player_tags, timestamp: Date.now() });
      await idb.set("offline_queue", queue);
      return { success: true, data: { success: true, count: ids.length, message: "Enqueued" } };
    }
    throw new NetworkError(error.message);
  }
  
  return { success: true, data: data as DismissResponse };
}

export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc('trigger_backend_update');
  
  if (error) return { success: false, data: null, error: { code: error.code, message: error.message } };
  return { success: true, data: data as any };
}

export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('headhunter_view').select('*').limit(20);
  if (error || !data) return null;
  return data.map(mapSbHeadhunterRow);
}

export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from('push_subscriptions').insert({
    subscription: JSON.parse(JSON.stringify(subscription))
  });
  
  return !error;
}
