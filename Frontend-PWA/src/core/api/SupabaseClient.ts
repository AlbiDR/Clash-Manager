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
import { SbRosterRowSchema } from "./MemberSchemas";
import { SbHeadhunterRowSchema } from "./RecruitSchemas";
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
 * Builds the merged headers via `new Request(input, init).headers` rather than
 * manually copying `input`'s headers and then `init`'s on top, so the spec's own
 * merge algorithm runs instead of a hand-rolled one. `input` itself is still what
 * gets fetched, unchanged.
 */
async function fetchSupabaseFresh(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  // Only used to obtain a spec-correct merge of input's and init's headers;
  // the original `input` (not this intermediate Request) is still what gets fetched.
  const headers = new Headers(new Request(input, init).headers);
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");

  return fetch(input, {
    ...init,
    cache: "no-store",
    headers,
  });
}

function buildSupabaseClient() {
    return createClient(getSupabaseUrl(), getSupabaseKey(), {
        db: { schema: 'features' },
        global: {
          fetch: fetchSupabaseFresh,
        },
    });
}

let cachedSupabaseClient: ReturnType<typeof buildSupabaseClient> | null = null;

/**
 * Internal factory to create a scoped Supabase client.
 * Configured to target the 'features' schema by default.
 *
 * @remarks
 * [FIX] Memoized to a single module-level instance. Every call site previously
 * got its own fresh `createClient(...)`, each spinning up its own GoTrueClient
 * bound to the same `sb-<project>-auth-token` storage key ("Multiple GoTrueClient
 * instances detected" in the console). Harmless for this app (no user auth), but
 * wasteful and the documented Supabase-recommended pattern is one client per key.
 */
export const createSupabaseClient = () => {
    if (!cachedSupabaseClient) {
      cachedSupabaseClient = buildSupabaseClient();
    }
    return cachedSupabaseClient;
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
    // [DECISION LOG] Invokes the `ping` Edge Function rather than the `features.ping()`
    // Postgres RPC: the RPC returns a bare 'pong' string with no version, so the
    // Settings panel's "Backend v..." readout could never show anything but its "0.0"
    // fallback. The Edge Function runs through the shared clinicalServe protocol, whose
    // success envelope already carries a version string kept in sync with every release.
    //
    // [FIX] Explicit Authorization header. supabase-js (2.112.x) deliberately does not
    // send Authorization as a Bearer fallback for new-format (`sb_publishable_...`) keys
    // when there is no active user session - confirmed via @supabase/functions-js's own
    // doc comment on FunctionsClient.invoke. This app has no auth/session at all, so
    // every ping request went out with `apikey` but no `Authorization`, and the edge
    // function's bearer check correctly rejected it with 401. REST calls via `.from()`/
    // `.rpc()` were unaffected since PostgREST tolerates an apikey-only request; `ping`
    // is the only call site using `functions.invoke`, which requires the header outright.
    const { data, error: pingError } = await supabase.functions.invoke('ping', {
      body: {},
      headers: { Authorization: `Bearer ${getSupabaseKey()}` },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    if (pingError) return { status: 'error', message: pingError.message };
    return { status: 'success', message: 'Pong', version: data?.version };
  } catch (pingHandshakeError) {
    return { status: 'error', message: String(pingHandshakeError) };
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
 * - MUTATES `lastSyncStatus`.
 */
export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  if (!isConfigured()) throw new Error("Supabase is not configured");
  
  const supabase = createSupabaseClient();
  const signal = options?.signal || new AbortController().signal;

  // [TYPES] postgrest-js's `.single()` narrows its return type to `PostgrestBuilder`,
  // which doesn't expose `.abortSignal()` -- but `.single()` returns `this` under the
  // hood (see PostgrestTransformBuilder.single), so the real object still has the
  // method at runtime. `.abortSignal()` must stay last (it resolves to a terminal,
  // non-chainable value once awaited, same as every other query below), so this is
  // a narrow type-only cast rather than a chain reorder.
  // [FIX] SCHEMA REACHABILITY: this previously addressed `substrate.pipeline_heartbeat`
  // directly. The remote Data API exposes only public/storage/graphql_public/features,
  // so PostgREST rejected every call with PGRST106 and the error was discarded below,
  // leaving the freshness stamp permanently null. Reads now go through the granted
  // `features.pipeline_heartbeat_view` projection.
  const heartbeatQueryWithSingle = supabase
    .schema('features')
    .from('pipeline_heartbeat_view')
    .select('last_success_at')
    .eq('component_id', 'ROYALE_DATA_INGESTOR')
    .single() as unknown as { abortSignal: (s: AbortSignal) => PromiseLike<{ data: { last_success_at: string | null } | null; error: { message: string } | null }> };

  // [ADR] Direct View Access: Bypassing the minimal SW-oriented get_pwa_data RPC
  // to fetch high-fidelity datasets directly from the authoritative feature views.
  const [rosterResponse, headhunterResponse, heartbeatResponse, blacklistResponse] = await Promise.all([
    supabase.schema('features').from('roster_view').select('*').abortSignal(signal),
    supabase.schema('features').from('headhunter_view').select('*').limit(250).abortSignal(signal),
    heartbeatQueryWithSingle.abortSignal(signal),
    // [FIX] SCHEMA REACHABILITY: was `drivers.recruit_blacklist`, which the Data API
    // does not expose; the warn-and-continue below meant the client-side blacklist was
    // permanently empty. `features.recruit_blacklist_view` also drops lapsed entries.
    supabase.schema('features').from('recruit_blacklist_view').select('player_tag').abortSignal(signal)
  ]);

  if (rosterResponse.error) throw new Error(`Roster Fetch Error: ${rosterResponse.error.message}`);
  if (headhunterResponse.error) throw new Error(`Headhunter Fetch Error: ${headhunterResponse.error.message}`);
  if (blacklistResponse.error) {
    console.warn("[Sync] Blacklist fetch failed; continuing with server-filtered recruits.", blacklistResponse.error.message);
  }
  
  // [GUARD] VALIDATION BOUNDARY: Harden external view data before domain mapping.
  // [THREAT:] Processing unvalidated raw data or using 'any' can cause runtime crashes if the DB schema shifts.
  const rosterData = v.parse(v.array(SbRosterRowSchema), rosterResponse.data || []);
  const headhunterData = v.parse(v.array(SbHeadhunterRowSchema), headhunterResponse.data || []);

  const BlacklistRowSchema = v.object({
    player_tag: v.string(),
  });
  const blacklistData = blacklistResponse.error
    ? []
    : v.parse(v.array(BlacklistRowSchema), blacklistResponse.data || []);
  const blacklistTags = blacklistData
    .map((blacklistRow) => {
      const observedPlayerTag = blacklistRow.player_tag;
      return observedPlayerTag ? (observedPlayerTag.startsWith("#") ? observedPlayerTag : `#${observedPlayerTag}`) : "";
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
  
  return webAppData;
}
