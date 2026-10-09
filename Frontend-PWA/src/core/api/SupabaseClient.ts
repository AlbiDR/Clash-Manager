// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "@supabase/supabase-js";
import { ref } from "vue";
import { fetchSupabaseFresh } from "./SupabaseTransport";
import type {
  WebAppData,
  PingResponse,
  Recruit,
  LeaderboardMember,
} from "@core/types";
import { SbRosterRowSchema } from "./MemberSchemas";
import { SbHeadhunterRowSchema } from "./RecruitSchemas";
import { mapSbRosterRow, mapSbHeadhunterRow } from "./DataMappers";
import { cleanTag } from "../utils/text";
import * as v from "valibot";

export { NetworkError } from "./ApiErrors";

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
 * ensure Layer 1 domain integrity. Satisfies ADR Section III: Validation Boundaries.
 *
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

/**
 * Reactive tracking reference for remote sync status.
 *
 * @remarks
 * Updated by {@link fetchRemote} upon completion or error resolution.
 */
export const lastSyncStatus = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);

/**
 * Timeout window (ms) for optional diagnostic metadata and heartbeat PostgREST queries.
 *
 * @remarks
 * [DECISION LOG] OPTIONAL METADATA TIMEOUT
 * Rationale: Optional provenance reads must never hold the roster and recruiting payload
 * hostage. Three seconds is long enough for a healthy PostgREST round trip but
 * short enough that a degraded heartbeat projection cannot turn into a full
 * foreground-sync failure. Satisfies ADR Section III: Diagnostic Isolation.
 */
export const OPTIONAL_METADATA_TIMEOUT_MS = 3_000;

/**
 * The pipeline component whose last_success_at dates the game data on screen.
 *
 * @remarks
 * Nightly maintenance also refreshes the roster snapshot when it completes, but
 * it fetches no game data (it purges, folds and rotates), so counting its stamp
 * would make a stalled ingestor read as fresh after every nightly run.
 */
const FRESHNESS_SOURCE = "ROYALE_DATA_INGESTOR";

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

function buildSupabaseClient() {
    return createClient(getSupabaseUrl(), getSupabaseKey(), {
        db: { schema: 'features' },
        // This application has no user sessions. Skip GoTrue initialization
        // entirely so every REST/RPC read cannot wait behind a browser auth
        // storage lock held by a suspended tab. The SDK still sends the public
        // API key and the database still enforces the anon role's grants.
        accessToken: async () => null,
        global: {
          fetch: fetchSupabaseFresh,
        },
    });
}

// EPHEMERAL: intentionally resets on cold start
// [THREAT:] Cached Supabase client instance resets on module re-load.
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
 * Checks if the Supabase environment variables are present and valid.
 *
 * @returns True if both endpoint URL and publishable key are defined.
 */
export function isConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

/**
 * Retrieves the current Supabase endpoint URL string or placeholder.
 *
 * @returns The resolved URL string or placeholder string when unconfigured.
 */
export function getApiUrl(): string {
  return getSupabaseUrl() || "(not configured)";
}

/**
 * Safely parses an ISO date string or timestamp string into a Unix timestamp (ms).
 *
 * @param timestamp - The ISO string, timestamp string, null, or undefined to parse.
 * @returns Parsed Unix timestamp in milliseconds, or null if invalid/absent.
 */
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
 * Runs a non-essential query with its own cancellation scope. The roster and
 * headhunter snapshots stay strict. The heartbeat may degrade because roster
 * timestamps can stand in for it; the blacklist is read through here only while
 * a last known blacklist can stand in for it (see getDismissedTags), because the
 * snapshot no longer filters dismissals server-side.
 *
 * @param label - Diagnostic string identifier for telemetry and logging.
 * @param parentSignal - AbortSignal from the parent fetch context.
 * @param execute - Function executing the optional PostgREST query with a scoped signal.
 * @returns Promise resolving to response object or null if timed out/failed.
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

const BlacklistRowsSchema = v.array(v.object({
  player_tag: v.string(),
}));

const SyncSnapshotMarkerRowsSchema = v.array(v.object({
  snapshot_name: v.picklist(["roster", "headhunter"]),
  generation: v.union([v.string(), v.number()]),
  refreshed_at: v.nullable(v.string()),
}));

type SnapshotMarkerName = "roster" | "headhunter";
type SnapshotRefreshMarker = { generation: string; refreshedAt: string };
type SnapshotMarkers = Record<SnapshotMarkerName, SnapshotRefreshMarker>;
type SnapshotRows<T> = { marker: SnapshotRefreshMarker; rows: T[] };
type RosterSnapshotRow = v.InferOutput<typeof SbRosterRowSchema>;
type HeadhunterSnapshotRow = v.InferOutput<typeof SbHeadhunterRowSchema>;

// In-memory only: a cold start always obtains snapshots once before it can skip reads.
let rosterSnapshotCache: SnapshotRows<RosterSnapshotRow> | null = null;
let headhunterSnapshotCache: SnapshotRows<HeadhunterSnapshotRow> | null = null;

function normalizeSnapshotGeneration(generation: string | number): string | null {
  if (typeof generation === "number") {
    return Number.isSafeInteger(generation) && generation >= 0 ? String(generation) : null;
  }
  return /^(0|[1-9]\d*)$/.test(generation) ? generation : null;
}

function parseSnapshotMarkers(response: OptionalQueryResponse | null): SnapshotMarkers | null {
  if (!response || response.error) return null;
  const validation = v.safeParse(SyncSnapshotMarkerRowsSchema, response.data);
  if (!validation.success || validation.output.length !== 2) return null;

  const markers: Partial<SnapshotMarkers> = {};
  for (const row of validation.output) {
    const generation = normalizeSnapshotGeneration(row.generation);
    if (!generation || !row.refreshed_at || parseTimestamp(row.refreshed_at) === null || markers[row.snapshot_name]) {
      return null;
    }
    markers[row.snapshot_name] = { generation, refreshedAt: row.refreshed_at };
  }

  if (!markers.roster || !markers.headhunter) return null;
  return { roster: markers.roster, headhunter: markers.headhunter };
}

function markersMatch(left: SnapshotRefreshMarker, right: SnapshotRefreshMarker): boolean {
  return left.generation === right.generation && left.refreshedAt === right.refreshedAt;
}

/**
 * Fetches the materialized roster snapshot from Supabase, utilizing marker-based memory caching.
 *
 * @param supabase - The scoped Supabase client instance.
 * @param signal - AbortSignal for network cancellation.
 * @param marker - Current snapshot refresh marker or null if unverified.
 * @returns Promise resolving to validated roster snapshot rows.
 * @throws Error if the query fails or payload validation rejects all rows.
 */
async function fetchRosterSnapshot(
  supabase: ReturnType<typeof createSupabaseClient>,
  signal: AbortSignal,
  marker: SnapshotRefreshMarker | null,
): Promise<RosterSnapshotRow[]> {
  if (marker && rosterSnapshotCache && markersMatch(rosterSnapshotCache.marker, marker)) {
    return rosterSnapshotCache.rows;
  }

  const response = await supabase.schema("features").from("roster_materialized").select("*")
    .order("raw_performance_score", { ascending: false, nullsFirst: false })
    .order("performance_score", { ascending: false, nullsFirst: false })
    .abortSignal(signal);
  if (response.error) throw new Error(`Roster Fetch Error: ${response.error.message}`);

  const rawData: unknown = response.data ?? [];
  if (!Array.isArray(rawData)) throw new Error("Roster payload was not an array");
  const rows = rawData.flatMap((row: unknown) => {
    const validation = v.safeParse(SbRosterRowSchema, row);
    return validation.success ? [validation.output] : [];
  });
  const rejectedRows = rawData.length - rows.length;
  if (rejectedRows > 0) console.warn(`[Sync] Dropped ${rejectedRows} invalid roster row(s).`);
  if (rawData.length > 0 && rows.length === 0) throw new Error("Roster validation failed for every row");

  if (marker && rows.length > 0) rosterSnapshotCache = { marker, rows };
  return rows;
}

/**
 * Fetches the materialized headhunter recruiting snapshot from Supabase, utilizing marker-based memory caching.
 *
 * @param supabase - The scoped Supabase client instance.
 * @param signal - AbortSignal for network cancellation.
 * @param marker - Current snapshot refresh marker or null if unverified.
 * @returns Promise resolving to validated headhunter snapshot rows.
 * @throws Error if the query fails or payload validation rejects all rows.
 */
async function fetchHeadhunterSnapshot(
  supabase: ReturnType<typeof createSupabaseClient>,
  signal: AbortSignal,
  marker: SnapshotRefreshMarker | null,
): Promise<HeadhunterSnapshotRow[]> {
  if (marker && headhunterSnapshotCache && markersMatch(headhunterSnapshotCache.marker, marker)) {
    return headhunterSnapshotCache.rows;
  }

  const response = await supabase.schema("features").from("headhunter_materialized").select("*")
    .order("raw_potential_score", { ascending: false })
    .limit(250).abortSignal(signal);
  if (response.error) throw new Error(`Headhunter Fetch Error: ${response.error.message}`);

  const rawData: unknown = response.data ?? [];
  if (!Array.isArray(rawData)) throw new Error("Headhunter payload was not an array");
  const rows = rawData.flatMap((row: unknown) => {
    const validation = v.safeParse(SbHeadhunterRowSchema, row);
    return validation.success ? [validation.output] : [];
  });
  const rejectedRows = rawData.length - rows.length;
  if (rejectedRows > 0) console.warn(`[Sync] Dropped ${rejectedRows} invalid headhunter row(s).`);
  if (rawData.length > 0 && rows.length === 0) throw new Error("Headhunter validation failed for every row");

  if (marker) headhunterSnapshotCache = { marker, rows };
  return rows;
}

/**
 * Resolves the tags of the recruits that must be withheld from the headhunter snapshot.
 *
 * @remarks
 * [DECISION LOG] AN UNKNOWN BLACKLIST IS NOT AN EMPTY ONE
 * Reading a failed or malformed blacklist as "nothing dismissed" re-lists every
 * recruit dismissed since the snapshot was last refreshed. A partial list is no
 * better, so one malformed row voids the whole read. The last known blacklist
 * stands in when there is one; otherwise the sync fails and the cached dataset
 * stays on screen.
 *
 * @param blacklistResponse - The blacklist read, or null if it timed out or failed.
 * @param knownBlacklist - Blacklist committed by the last successful sync, if any.
 * @returns Dismissed player tags, each prefixed with '#'.
 * @throws Error if the read is unusable and no blacklist is known.
 */
function getDismissedTags(
  blacklistResponse: OptionalQueryResponse | null,
  knownBlacklist?: readonly string[],
): string[] {
  const blacklistValidation = blacklistResponse && !blacklistResponse.error
    ? v.safeParse(BlacklistRowsSchema, blacklistResponse.data)
    : null;

  if (blacklistValidation?.success) {
    return blacklistValidation.output
      .map(({ player_tag: observedPlayerTag }) =>
        observedPlayerTag ? (observedPlayerTag.startsWith("#") ? observedPlayerTag : `#${observedPlayerTag}`) : "",
      )
      .filter(Boolean);
  }

  const failureReason = blacklistResponse?.error?.message
    ?? (blacklistResponse ? "malformed rows" : "no response");
  if (knownBlacklist) {
    console.warn(`[Sync] Recruit blacklist unavailable (${failureReason}); filtering with the last known blacklist.`);
    return [...knownBlacklist];
  }
  throw new Error(`Recruit blacklist unavailable (${failureReason}); dismissed recruits cannot be withheld`);
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

/** A handshake result, carrying the edge function's HTTP status when it answered with an error. */
export type PingResult = PingResponse & { httpStatus?: number };

/**
 * Reads the HTTP status of an edge function's error answer.
 *
 * @param functionError - The error returned by `functions.invoke`.
 * @returns The status, or undefined when the function never answered (network or relay failure).
 */
function getEdgeFunctionStatus(functionError: unknown): number | undefined {
  const errorContext: unknown = (functionError as { context?: unknown } | null)?.context;
  return errorContext instanceof Response ? errorContext.status : undefined;
}

/**
 * Performs a connectivity handshake with the Supabase backend.
 *
 * @param options - Optional configuration including AbortSignal.
 * @returns A PingResult indicating success or error.
 */
export async function ping(options?: { signal?: AbortSignal; force?: boolean }): Promise<PingResult> {
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
    if (pingError) return { status: 'error', message: pingError.message, httpStatus: getEdgeFunctionStatus(pingError) };
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
 * [DECISION LOG] FRESHNESS EVIDENCE RESOLUTION
 * The ingestor heartbeat's last_success_at is the freshness of the payload.
 * Roster row timestamps are only a lower bound, used when the heartbeat
 * cannot be read.
 *
 * @param options - Fetch configuration including AbortSignal.
 * @param options.knownBlacklist - Blacklist committed by the last successful sync;
 *   stands in if this sync's blacklist read fails. Omit when no sync has succeeded.
 * @returns A Promise resolving to a fully populated WebAppData object.
 * @throws Error if any fetch fails or data validation fails.
 *
 * @sideeffects
 * - MUTATES `lastSyncStatus`.
 */
export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
  knownBlacklist?: readonly string[];
}): Promise<WebAppData> {
  if (!isConfigured()) throw new Error("Supabase is not configured");
  
  const supabase = createSupabaseClient();
  const signal = options?.signal || new AbortController().signal;
  signal.throwIfAborted();

  // [FIX] SCHEMA REACHABILITY: this previously addressed `substrate.pipeline_heartbeat`
  // directly. The remote Data API exposes only public/storage/graphql_public/features,
  // so PostgREST rejected every call with PGRST106 and the error was discarded below,
  // leaving the freshness stamp permanently null. Reads now go through the granted
  // `features.pipeline_heartbeat_view` projection.
  const fetchHeartbeats = (heartbeatSignal: AbortSignal) =>
    supabase.schema('features').from('pipeline_heartbeat_view')
      .select('component_id,last_success_at')
      .eq('component_id', FRESHNESS_SOURCE)
      .abortSignal(heartbeatSignal);

  // [ADR] Direct View Access: Bypassing the minimal SW-oriented get_pwa_data RPC
  // to fetch high-fidelity datasets directly from the feature schema.
  // Roster and headhunter are the product payload and stay fail-closed. The
  // heartbeat is enrichment: a single slow optional projection must not make an
  // otherwise complete refresh look offline. The blacklist is optional only
  // while a last known copy exists (see below).
  // [DECISION LOG] SNAPSHOTS, NOT LIVE VIEWS: roster_view and headhunter_view
  // are computed on demand and cost about a second of server time per read,
  // which under load outran the server's 6 s read timeout and left a cold
  // start with nothing to show. The sync reads their materialized snapshots,
  // refreshed server-side when a pipeline run completes, so a read is an
  // indexed scan of a few hundred rows however busy the instance is. Order is
  // stated here because a snapshot has no storage order of its own.
  // [DECISION LOG] THE SNAPSHOT FREEZES THE BLACKLIST FILTER: headhunter_view
  // withholds blacklisted recruits, but its snapshot keeps whatever the view
  // returned at the last pipeline refresh, so a recruit dismissed since then is
  // still in it. The client withholds them using the live blacklist. That read
  // is optional only while a last known blacklist can stand in for it; without
  // one it gets the same transport budget as the snapshots.
  // [FIX] SCHEMA REACHABILITY: was `drivers.recruit_blacklist`, which the Data API
  // does not expose. `features.recruit_blacklist_view` also drops lapsed entries.
  const fetchBlacklist = (blacklistSignal: AbortSignal) =>
    supabase.schema('features').from('recruit_blacklist_view').select('player_tag').abortSignal(blacklistSignal);
  const markerResponse = await resolveOptionalQuery(
    "Snapshot marker",
    signal,
    (markerSignal) => supabase.schema('features')
      .rpc('sync_snapshot_marker', undefined, { get: true }).abortSignal(markerSignal),
  );
  const snapshotMarkers = parseSnapshotMarkers(markerResponse);
  const rosterRequest = fetchRosterSnapshot(supabase, signal, snapshotMarkers?.roster ?? null);
  const headhunterRequest = fetchHeadhunterSnapshot(supabase, signal, snapshotMarkers?.headhunter ?? null);
  const heartbeatRequest = resolveOptionalQuery("Pipeline heartbeat", signal, fetchHeartbeats);
  const blacklistRequest = options?.knownBlacklist
    ? resolveOptionalQuery("Recruit blacklist", signal, fetchBlacklist)
    : fetchBlacklist(signal);

  const [snapshotResults, heartbeatResponse, blacklistResponse] = await Promise.all([
    Promise.allSettled([rosterRequest, headhunterRequest]),
    heartbeatRequest,
    blacklistRequest,
  ]);
  const rosterResult = snapshotResults[0];
  const headhunterResult = snapshotResults[1];
  if (rosterResult.status === "rejected") throw rosterResult.reason;
  if (headhunterResult.status === "rejected") throw headhunterResult.reason;
  const rosterData = rosterResult.value;
  const headhunterData = headhunterResult.value;

  const blacklistTags = getDismissedTags(blacklistResponse, options?.knownBlacklist);
  const dismissedRecruitIds = new Set(blacklistTags.map(cleanTag));

  const leaderboardMembers: LeaderboardMember[] = rosterData.map(mapSbRosterRow);
  const headhunterRecruits: Recruit[] = headhunterData
    .map(mapSbHeadhunterRow)
    .filter((recruit) => !dismissedRecruitIds.has(recruit.id));
  // SSOT: vars.PLAYER_TAG is injected by deploy-pwa.yml as VITE_PLAYER_TAG at build time.
  const playerTag: string = import.meta.env.VITE_PLAYER_TAG || "";
  
  // [DECISION LOG] THE HEARTBEAT IS THE FRESHNESS SIGNAL
  // The roster is a snapshot refreshed by the same COMPLETED heartbeat write that
  // stamps the ingestor's `last_success_at`, so that stamp is how fresh the game
  // data on screen is. Nightly maintenance also refreshes the snapshot, but only
  // the ingestor's last_success_at dates the game data (see FRESHNESS_SOURCE).
  // Row timestamps were combined with it (newest wins) because a run could commit
  // rows and then report FAILED; such rows now never reach the snapshot, which
  // refreshes only on COMPLETED. Row timestamps also stop meaning "last ingested"
  // once unchanged rows are no longer rewritten: a quiet clan would read as stale
  // and an old member edit would vouch for a stalled pipeline. They remain only a
  // lower bound for a sync whose heartbeat read failed.
  const HeartbeatRowsSchema = v.array(v.object({
    last_success_at: v.nullable(v.string()),
  }));
  const heartbeatValidation = heartbeatResponse?.error || !heartbeatResponse?.data
    ? null
    : v.safeParse(HeartbeatRowsSchema, heartbeatResponse.data);
  if (!heartbeatResponse || heartbeatResponse.error || (heartbeatValidation && !heartbeatValidation.success)) {
    console.warn("[Sync] Pipeline heartbeat unavailable; using roster timestamps as a lower bound on freshness.");
  }
  const heartbeatTimestamps = heartbeatValidation?.success
    ? heartbeatValidation.output
      .map((heartbeatRow) => parseTimestamp(heartbeatRow.last_success_at))
      .filter((heartbeatStamp): heartbeatStamp is number => heartbeatStamp !== null)
    : [];
  const heartbeatTimestamp = heartbeatTimestamps.length > 0 ? Math.max(...heartbeatTimestamps) : null;
  const rosterTimestamps = rosterData
    .map((rosterRow) => parseTimestamp(rosterRow.last_ingested_at))
    .filter((rosterTimestamp): rosterTimestamp is number => rosterTimestamp !== null);
  const rosterTimestamp = rosterTimestamps.length > 0 ? Math.max(...rosterTimestamps) : null;

  // [DECISION LOG] NO FORGED FRESHNESS
  // Never replace unknown freshness with the client's current clock, as doing so
  // makes arbitrarily old source data appear freshly ingested.
  const timestamp = heartbeatTimestamp ?? rosterTimestamp ?? 0;
  signal.throwIfAborted();
  
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
