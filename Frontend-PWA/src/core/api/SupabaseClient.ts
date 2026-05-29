// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "@supabase/supabase-js";
import { ref } from "vue";
import type {
  WebAppData,
  PingResponse,
  Recruit,
  LeaderboardMember,
} from "@core/types";
import { loadCache, saveCache } from "../services/StorageService";
import {
  SbRosterRowSchema,
  SbHeadhunterRowSchema
} from "./DataSchemas";
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
export const getSupabaseUrl = () => import.meta.env.VITE_SUPABASE_URL || "";
export const getSupabaseKey = () => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

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
  // [THREAT:] Processing unvalidated raw data or using 'any' can cause runtime crashes if the DB schema shifts.
  const rosterData = v.parse(v.array(SbRosterRowSchema), rosterResponse.data || []);
  const headhunterData = v.parse(v.array(SbHeadhunterRowSchema), headhunterResponse.data || []);

  const BlacklistRowSchema = v.object({
    player_tag: v.string(),
  });
  const blacklistData = v.parse(v.array(BlacklistRowSchema), blacklistResponse.data || []);
  const blacklistTags = blacklistData
    .map((row) => {
      const tag = row.player_tag;
      return tag ? (tag.startsWith("#") ? tag : `#${tag}`) : "";
    })
    .filter(Boolean);

  const leaderboardMembers: LeaderboardMember[] = rosterData.map(mapSbRosterRow);
  const headhunterRecruits: Recruit[] = headhunterData.map(mapSbHeadhunterRow);
  // SSOT: vars.PLAYER_TAG is injected by deploy-pwa.yml as VITE_PLAYER_TAG at build time.
  const playerTag: string = import.meta.env.VITE_PLAYER_TAG || "";
  
  // Rationale: Use the kernel's ingestion heartbeat as the authoritative data age.
  // [GUARD] Validate heartbeat structure before date conversion.
  const HeartbeatRowSchema = v.object({
    last_success_at: v.nullable(v.string()),
  });
  const heartbeatData = heartbeatResponse.data
    ? v.parse(HeartbeatRowSchema, heartbeatResponse.data)
    : null;
  const timestamp = heartbeatData?.last_success_at
    ? new Date(heartbeatData.last_success_at).getTime()
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
