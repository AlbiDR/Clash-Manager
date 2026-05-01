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
import { ProfileInputSchema } from "./DataSchemas";
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
 */
function mapSbRosterRow(row: any): LeaderboardMember {
  return {
    id: row.player_tag?.replace('#', '') || '',
    n: row.player_name || '',
    t: Number(row.trophies) || 0,
    performanceScore: Number(row.pes || row.performance_score) || 0,
    performanceRawScore: Number(row.rpes || row.raw_performance_score) || 0,
    dt: 0, // roster_view currently does not provide a score delta
    d: {
      role: row.role || '',
      days: Number(row.tenure_days) || 0,
      avg: Number(row.donations) || 0,
      seen: row.last_seen_at || '-',
      rate: row.stability_index ? `${Math.round(Number(row.stability_index) * 100)}%` : '-',
      wfame: Number(row.week_fame) || 0,
      hist: '-', // roster_view currently does not provide a war history string
    },
  };
}

/**
 * Transforms a Supabase headhunter row into a Recruit
 */
function mapSbHeadhunterRow(row: any): Recruit {
  return {
    id: row.player_tag?.replace('#', '') || '',
    n: row.player_name || '',
    t: Number(row.trophies) || 0,
    potentialScore: Number(row.pos || row.potential_score) || 0,
    potentialRawScore: Number(row.rpos || row.raw_potential_score) || 0,
    lastScan: row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now(),
    d: {
      don: Number(row.donations) || 0,
      war: Number(row.war_wins) || 0,
      ago: row.found_date || '-',
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
  const { data, error } = await supabase.from('roster_view').select('*').eq('player_tag', tag.startsWith('#') ? tag : `#${tag}`).single();
  
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Profile not found");
  
  return {
    profile: {
      name: data.player_name,
      tag: data.player_tag,
      kingLevel: data.exp_level || 1,
      xpIntoLevel: 0
    },
    cards: [],
    inventory: { gold: 0, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } }
  } as any;
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
