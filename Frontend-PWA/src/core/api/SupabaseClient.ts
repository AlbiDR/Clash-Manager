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

export const lastHubDiagnosis = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

let _workerHubTestOverride: boolean | null = null;
export const _setWorkerHubTestOverride = (val: boolean | null) => { _workerHubTestOverride = val; };

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

export function isWorkerConfigured(): boolean {
  return Boolean(import.meta.env.VITE_WORKER_URL);
}

export async function pingWorker(): Promise<boolean> {
  // Not used in Supabase context generally, but preserving signature
  return true;
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
    performanceScore: Number(row.performance_score) || 0,
    performanceRawScore: Number(row.raw_performance_score) || 0,
    dt: row.last_seen_at ? new Date(row.last_seen_at).getTime() : Date.now(),
    d: {
      role: row.role || '',
      days: Number(row.tenure_days) || 0,
      avg: Number(row.performance_score) || 0,
      seen: row.last_seen_label || '-',
      rate: row.stability_index ? `${Math.round(Number(row.stability_index) * 100)}%` : '-',
      wfame: Number(row.week_fame) || 0,
      hist: '-',
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
    potentialScore: Number(row.performance_score) || 0,
    potentialRawScore: Number(row.raw_performance_score) || 0,
    lastScan: row.last_ingested_at ? new Date(row.last_ingested_at).getTime() : Date.now(),
    d: {
      don: Number(row.donations) || 0,
      war: Number(row.war_fame) || 0,
      ago: row.last_seen_label || '-',
      cards: Number(row.cards_found) || 0,
    },
  };
}

export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  if (!isConfigured()) throw new Error("Supabase is not configured");
  
  const supabase = createSupabaseClient();
  
  // Fetch from Supabase views
  const [rosterRes, hhRes] = await Promise.all([
    supabase.from('roster_view').select('*').abortSignal(options?.signal || new AbortController().signal),
    supabase.from('headhunter_view').select('*').abortSignal(options?.signal || new AbortController().signal)
  ]);
  
  if (rosterRes.error) throw new Error(`Roster Fetch Error: ${rosterRes.error.message}`);
  if (hhRes.error) throw new Error(`Headhunter Fetch Error: ${hhRes.error.message}`);
  
  const lb: LeaderboardMember[] = (rosterRes.data || []).map(mapSbRosterRow);
  const hh: Recruit[] = (hhRes.data || []).map(mapSbHeadhunterRow);
  
  const timestamp = Date.now();
  
  const webAppData: WebAppData = {
    lb,
    hh,
    playerTag: "",
    timestamp,
    dataSource: "SUPABASE",
    hubTimestamp: timestamp,
    lastCompiled: timestamp,
    lastFetched: timestamp,
  };
  
  lastHubDiagnosis.value = "SUCCESS";
  
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
  // Mocked for Supabase migration compatibility
  return { success: true, data: { dismissed: items.length } };
}

export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  return { success: true, data: { dismissed: ids.length } };
}

export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return { success: true, data: { success: true, message: "Triggered" } };
}

export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from('headhunter_view').select('*').limit(20);
  if (error || !data) return null;
  return data.map(mapSbHeadhunterRow);
}

export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  return true;
}
