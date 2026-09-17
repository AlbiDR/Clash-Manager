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
 * [DECISION LOG] OPTIONAL METADATA TIMEOUT
 * Rationale: Optional provenance reads must never hold the roster and recruiting payload
 * hostage. Three seconds is long enough for a healthy PostgREST round trip but
 * short enough that a degraded heartbeat projection cannot turn into a full
 * foreground-sync failure.
 */
export const OPTIONAL_METADATA_TIMEOUT_MS = 3_000;

/**
 * Status indicator for backend ingestion pipeline execution.
 */
export type PipelineHealthStatus = "COMPLETED" | "RUNNING" | "FAILED";

/**
 * A deliberately small, public-safe view of the ingestion heartbeat.
 *
 * @remarks
 * Serves as diagnostic metadata for Settings rather than the payload used to hydrate the app.
 * Satisfies CleanStack Architecture ADR Section III for health reporting.
 */
export interface PipelineHealth {
  /** Current state of the ingestion pipeline */
  status: PipelineHealthStatus;
  /** Unix timestamp (ms) of the last successful ingestion pass */
  lastSuccessAt: number | null;
  /** Unix timestamp (ms) of the last triggered ingestion pass */
  lastTriggeredAt: number | null;
  /** Unix timestamp (ms) of the last failed ingestion pass */
  lastFailureAt: number | null;
}

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

/**
 * Resolves the active Supabase endpoint URL, incorporating operator overrides.
 *
 * @remarks
 * [DECISION LOG] ENDPOINT OVERRIDE RESOLUTION
 * Settings stores an operator-selected endpoint in localStorage and reloads the app.
 * Bootstrap treats that value as valid configuration, so transport resolves the same SSOT.
 *
 * @returns Resolved Supabase endpoint URL string or empty string if unconfigured.
 */
export const getSupabaseUrl = (): string => {
  let localOverride = "";
  if (typeof window !== "undefined") {
    try {
      localOverride = window.localStorage.getItem("cm_supabase_url")?.trim() || "";
    } catch {
      // [THREAT: STORAGE ACCESS DENIED]
      // Storage can be denied in hardened/private browser contexts. The build
      // configuration remains a valid, deterministic fallback in that case.
    }
  }

  return localOverride || import.meta.env.VITE_SUPABASE_URL || "";
};

/**
 * Resolves the active Supabase publishable key from environment configuration.
 *
 * @returns The publishable API key string.
 */
export const getSupabaseKey = (): string => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

/**
 * Fetch wrapper overriding default browser cache headers for fresh PostgREST queries.
 *
 * @remarks
 * [DECISION LOG] SPEC-CORRECT HEADER MERGE
 * Builds merged headers via `new Request(input, init).headers` rather than manually
 * copying headers, ensuring Fetch API spec header merging logic executes natively.
 *
 * @param input - Fetch URL or RequestInfo object.
 * @param init - Optional RequestInit configuration options.
 * @returns Promise resolving to the network Response.
 */
async function fetchSupabaseFresh(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  // [THREAT: STALE_HTTP_CACHE]
  // Bypasses HTTP browser cache layer to prevent stale PostgREST/Supabase queries.
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

function parseTimestamp(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const parsedTimestamp = Date.parse(timestamp);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : null;
}

type OptionalQueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

/**
 * Runs a non-essential query with its own cancellation scope. The authoritative
 * roster and headhunter views remain strict; heartbeat and blacklist enrichment
 * can safely degrade because roster timestamps and server-side filtering retain
 * their core contracts.
 */
async function resolveOptionalQuery<T extends OptionalQueryResponse>(
  label: string,
  parentSignal: AbortSignal,
  execute: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T | null> {
  const optionalController = new AbortController();
  const abortFromParent = () => optionalController.abort(parentSignal.reason);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (parentSignal.aborted) {
    abortFromParent();
  } else {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await Promise.race([
      Promise.resolve(execute(optionalController.signal)),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(`${label} metadata timed out`);
          optionalController.abort(timeoutError);
          resolve(null);
        }, OPTIONAL_METADATA_TIMEOUT_MS);
      }),
    ]);

    if (response === null) {
      console.warn(`[Sync] ${label} metadata timed out; continuing without it.`);
    }
    return response;
  } catch (optionalFailure: unknown) {
    // The parent request's abort must still propagate through the essential
    // queries. This branch only isolates the optional query itself.
    if (!parentSignal.aborted) {
      console.warn(`[Sync] ${label} metadata unavailable; continuing without it.`, optionalFailure);
    }
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

/**
 * Retrieves an independently bounded health snapshot for Settings.
 *
 * @remarks
 * [DECISION LOG] METADATA DECOUPLING
 * The data pipeline indicator must never make Settings appear frozen when its metadata
 * view is unavailable, and it must remain separate from the payload sync.
 * Satisfies CleanStack Architecture ADR Section III: Diagnostic Isolation.
 *
 * @returns Promise resolving to PipelineHealth or null if unreachable/unconfigured.
 */
export async function fetchPipelineHealth(): Promise<PipelineHealth | null> {
  if (!isConfigured()) return null;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const healthQuery = createSupabaseClient()
      .schema("features")
      .from("pipeline_heartbeat_view")
      .select("status,last_success_at,last_triggered_at,last_failure_at")
      .eq("component_id", "ROYALE_DATA_INGESTOR")
      .single() as unknown as {
        abortSignal: (signal: AbortSignal) => PromiseLike<{
          data: {
            status: string | null;
            last_success_at: string | null;
            last_triggered_at: string | null;
            last_failure_at: string | null;
          } | null;
          error: { message: string } | null;
        }>;
      };

    const response = await Promise.race([
      Promise.resolve(healthQuery.abortSignal(controller.signal)),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort(new Error("Pipeline health check timed out"));
          resolve(null);
        }, OPTIONAL_METADATA_TIMEOUT_MS);
      }),
    ]);

    if (!response || response.error || !response.data) return null;
    const status = response.data.status;
    if (status !== "COMPLETED" && status !== "RUNNING" && status !== "FAILED") return null;

    return {
      status,
      lastSuccessAt: parseTimestamp(response.data.last_success_at),
      lastTriggeredAt: parseTimestamp(response.data.last_triggered_at),
      lastFailureAt: parseTimestamp(response.data.last_failure_at),
    };
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Diagnostic summary for free-tier resource-pressure events.
 *
 * @remarks
 * Logged by substrate.check_resource_pressure(). Null means no warning in the last 48h
 * or unreachable check.
 */
export interface ResourcePressureWarning {
  /** Warning message detail */
  message: string;
  /** Timestamp (ms) when warning was recorded */
  createdAt: number | null;
}

/**
 * Retrieves the most recent resource-pressure warning, if any, for Settings.
 *
 * @remarks
 * [DECISION LOG] DIAGNOSTIC BOUNDARY
 * Bounded and best-effort for the same reason as fetchPipelineHealth: this is
 * diagnostic metadata and must never block or stall the Settings view.
 *
 * @returns Promise resolving to ResourcePressureWarning or null if clear/unreachable.
 */
export async function fetchResourcePressure(): Promise<ResourcePressureWarning | null> {
  if (!isConfigured()) return null;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const healthQuery = createSupabaseClient()
      .schema("features")
      .from("resource_health_view")
      .select("message,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as {
        abortSignal: (signal: AbortSignal) => PromiseLike<{
          data: { message: string | null; created_at: string | null } | null;
          error: { message: string } | null;
        }>;
      };

    const response = await Promise.race([
      Promise.resolve(healthQuery.abortSignal(controller.signal)),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          controller.abort(new Error("Resource pressure check timed out"));
          resolve(null);
        }, OPTIONAL_METADATA_TIMEOUT_MS);
      }),
    ]);

    if (!response || response.error || !response.data || !response.data.message) return null;

    return {
      message: response.data.message,
      createdAt: parseTimestamp(response.data.created_at),
    };
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
  // Roster and headhunter are the product payload and stay fail-closed. The
  // heartbeat and blacklist are enrichment: a single slow optional projection
  // must not make an otherwise complete refresh look offline.
  const rosterRequest =
    supabase.schema('features').from('roster_view').select('*').abortSignal(signal),
  headhunterRequest =
    supabase.schema('features').from('headhunter_view').select('*').limit(250).abortSignal(signal),
  heartbeatRequest = resolveOptionalQuery("Pipeline heartbeat", signal, (optionalSignal) =>
    heartbeatQueryWithSingle.abortSignal(optionalSignal),
  ),
  blacklistRequest = resolveOptionalQuery("Recruit blacklist", signal, (optionalSignal) =>
    // [FIX] SCHEMA REACHABILITY: was `drivers.recruit_blacklist`, which the Data API
    // does not expose; the warn-and-continue below meant the client-side blacklist was
    // permanently empty. `features.recruit_blacklist_view` also drops lapsed entries.
    supabase.schema('features').from('recruit_blacklist_view').select('player_tag').abortSignal(optionalSignal),
  );

  const [rosterResponse, headhunterResponse, heartbeatResponse, blacklistResponse] = await Promise.all([
    rosterRequest,
    headhunterRequest,
    heartbeatRequest,
    blacklistRequest,
  ]);

  if (rosterResponse.error) throw new Error(`Roster Fetch Error: ${rosterResponse.error.message}`);
  if (headhunterResponse.error) throw new Error(`Headhunter Fetch Error: ${headhunterResponse.error.message}`);
  if (blacklistResponse?.error) {
    console.warn("[Sync] Blacklist fetch failed; continuing with server-filtered recruits.", blacklistResponse.error.message);
  }
  
  // [GUARD] VALIDATION BOUNDARY: Harden external view data before domain mapping.
  // One malformed row must not discard every valid member or recruit, but a
  // wholly malformed payload is still rejected rather than certified as empty.
  const rawRosterData: unknown = rosterResponse.data ?? [];
  const rawHeadhunterData: unknown = headhunterResponse.data ?? [];
  if (!Array.isArray(rawRosterData)) throw new Error("Roster payload was not an array");
  if (!Array.isArray(rawHeadhunterData)) throw new Error("Headhunter payload was not an array");

  const rosterData = rawRosterData.flatMap((rosterRow) => {
    const validation = v.safeParse(SbRosterRowSchema, rosterRow);
    return validation.success ? [validation.output] : [];
  });
  const headhunterData = rawHeadhunterData.flatMap((headhunterRow) => {
    const validation = v.safeParse(SbHeadhunterRowSchema, headhunterRow);
    return validation.success ? [validation.output] : [];
  });
  const rejectedRosterRows = rawRosterData.length - rosterData.length;
  const rejectedHeadhunterRows = rawHeadhunterData.length - headhunterData.length;
  if (rejectedRosterRows > 0) console.warn(`[Sync] Dropped ${rejectedRosterRows} invalid roster row(s).`);
  if (rejectedHeadhunterRows > 0) console.warn(`[Sync] Dropped ${rejectedHeadhunterRows} invalid headhunter row(s).`);
  if (rawRosterData.length > 0 && rosterData.length === 0) {
    throw new Error("Roster validation failed for every row");
  }
  if (rawHeadhunterData.length > 0 && headhunterData.length === 0) {
    throw new Error("Headhunter validation failed for every row");
  }

  const BlacklistRowSchema = v.object({
    player_tag: v.string(),
  });
  const rawBlacklistData: unknown = blacklistResponse?.error ? [] : blacklistResponse?.data ?? [];
  const blacklistData = Array.isArray(rawBlacklistData)
    ? rawBlacklistData.flatMap((blacklistRow) => {
      const validation = v.safeParse(BlacklistRowSchema, blacklistRow);
      return validation.success ? [validation.output] : [];
    })
    : [];
  if (blacklistResponse && !blacklistResponse.error && (!Array.isArray(rawBlacklistData) || blacklistData.length !== rawBlacklistData.length)) {
    console.warn("[Sync] Ignored malformed optional blacklist data.");
  }
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
  const heartbeatValidation = heartbeatResponse?.error || !heartbeatResponse?.data
    ? null
    : v.safeParse(HeartbeatRowSchema, heartbeatResponse.data);
  if (!heartbeatResponse || heartbeatResponse.error || (heartbeatValidation && !heartbeatValidation.success)) {
    console.warn("[Sync] Pipeline heartbeat unavailable; deriving freshness from roster data.");
  }
  const heartbeatTimestamp = heartbeatValidation?.success
    ? parseTimestamp(heartbeatValidation.output.last_success_at)
    : null;
  const rosterTimestamps = rosterData
    .map((rosterRow) => parseTimestamp(rosterRow.last_ingested_at))
    .filter((rosterTimestamp): rosterTimestamp is number => rosterTimestamp !== null);
  const rosterTimestamp = rosterTimestamps.length > 0 ? Math.max(...rosterTimestamps) : null;
  // Never replace unknown freshness with the client's current clock. Doing so
  // makes arbitrarily old source data appear freshly ingested.
  const timestamp = heartbeatTimestamp ?? rosterTimestamp ?? 0;
  
  const webAppData: WebAppData = {
    lb: leaderboardMembers,
    hh: headhunterRecruits,
    playerTag,
    timestamp,
    dataSource: "SUPABASE",
    remoteTimestamp: timestamp,
    lastCompiled: timestamp,
    // [DECISION LOG] WHEN WE FETCHED, NOT WHEN THE SOURCE LAST RAN:
    // All three of these carried the ingestor's heartbeat, so the app held one
    // number under three names and could not tell "this client has not synced
    // in a while" from "the client is syncing fine and the upstream pipeline is
    // behind". Those are opposite faults with opposite remedies, and the status
    // pill reported both of them as STALE, which reads to an operator as the app
    // having failed. This is the client's own clock.
    lastFetched: Date.now(),
    blacklist: blacklistTags,
  };
  
  lastSyncStatus.value = "SUCCESS";
  
  return webAppData;
}
