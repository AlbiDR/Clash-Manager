// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [MODULE] API CLIENT (THE BRIDGE)
 * ----------------------------------------------------------------------------
 * The primary communication layer between the PWA, the Google Apps Script
 * (GAS) backend, and the high-performance Worker subsystem.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * **Transport Strategy:**
 * - **Hybrid Transport:** Combines a POST-only GAS protocol for persistent
 *   storage with direct JSON/REST communication for Worker-side operations.
 * - **Matrix Inflation:** GAS payloads are transmitted as optimized arrays
 *   of arrays to minimize JSON overhead before being re-hydrated.
 * - **Offline Resiliency:** Integrated with IndexedDB and a background sync
 *   queue for unreliable network environments.
 *
 * **Performance Optimization:**
 * - Uses 'text/plain' for GAS to bypass CORS preflight (OPTIONS) overhead.
 * - Implements exponential backoff and request deduplication.
 * ============================================================================
 */
import { idb } from "../services/StorageService";


import type {
  ApiResponse,
  WebAppData,
  PingResponse,
  DismissResponse,
  DismissalRequest,
  Recruit,
  LeaderboardMember,
} from "@core/types";
import * as v from "valibot";
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";
const pendingRequests = new Map<string, Promise<unknown>>(); // EPHEMERAL: intentionally resets on restart

/**
 * CUSTOM ERROR TYPE
 * Used to distinguish between fatal server rejections and temporary network/timeout failures.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
    // Ensure the name is preserved through serialization/transpilation
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

// --- Schemas & Constants ---

// Default Schemas for fallback (matches V11 Controller Standard)
const DEFAULT_LB_SCHEMA = [
  "id", "n", "role", "t", "performanceScore", "performanceRawScore", 
  "days", "req", "avg", "tot", "seen", "rate", "wfame", 
  "hist", "dt", "war"
];

const DEFAULT_HH_SCHEMA = [
  "id", "n", "t", "potentialScore", "potentialRawScore", "don", 
  "war", "cards", "ago", "lastScan"
];

const WebAppDataSchema = v.object({
  format: v.optional(v.string()),
  schema: v.optional(
    v.object({
      lb: v.array(v.string()),
      hh: v.array(v.string()),
    }),
  ),
  lb: v.array(v.array(v.unknown())),
  hh: v.array(v.array(v.unknown())),
  timestamp: v.union([v.number(), v.string()]),
  playerTag: v.optional(v.string()),
});

import { ProfileInputSchema, MemberSchema, RecruitSchema } from "./DataSchemas";

const BaseWebAppDataSchema = v.object({
  lb: v.array(MemberSchema),
  hh: v.array(RecruitSchema),
  playerTag: v.optional(v.string()),
  timestamp: v.union([v.number(), v.string()]),
});

import { HubStateSchema } from "./DataSchemas";

const WorkerCandidateSchema = v.object({
  tag: v.string(),
  name: v.string(),
  trophies: v.number(),
  rawScore: v.number(),
  donations: v.number(),
  war: v.number(),
  cards: v.number(),
});

const WorkerScanResponseSchema = v.object({
  candidates: v.array(WorkerCandidateSchema),
});

interface GenericEnvelope<T> {
  success?: boolean;
  status?: string;
  data?: T;
  error?: { message: string };
  message?: string;
}

/**
 * Resolves the target Google Apps Script URL.
 *
 * @remarks
 * Prioritizes LocalStorage over environment variables to allow users to
 * swap backend deployments (e.g. switching between Dev/Prod) without
 * re-building the entire application.
 */
const getGasUrl = () => {
  let url = "";
  if (typeof localStorage !== "undefined") {
    //  CONFIG PRIORITY: User override (LocalStorage) > Build Config (Env)
    url =
      localStorage.getItem("cm_gas_url") || import.meta.env.VITE_GAS_URL || "";
  } else {
    url = import.meta.env.VITE_GAS_URL || "";
  }

  if (!url) return "";
  
  url = url.trim();

  //  SMART RESOLUTION: Handle raw Deployment IDs (format: AKfycb...)
  if (!url.includes("/") && !url.includes(".") && url.length > 20) {
     return `https://script.google.com/macros/s/${url}/exec`;
  }

  //  SYNC: Ensure SW can see the URL via IDB
  idb.set("cm_gas_url", url).catch(() => {});

  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    url = `https://${url}`;
  }

  return url;
};

//  DIRECT WORKER SUPPORT
const getWorkerUrl = () => {
  if (typeof localStorage !== "undefined") {
    const override = localStorage.getItem("cm_worker_url");
    if (override) return override;
  }
  return import.meta.env.VITE_WORKER_URL || "";
};

// --- Utility Helpers for Data Inflation ---

/**
 * Creates a mapping from field names to their array indices.
 * Used for O(1) field lookup during matrix inflation.
 */
export function createSchemaMap(schema: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < schema.length; i++) {
    map[schema[i]] = i;
  }
  return map;
}

/**
 * [GUARD] VALIDATION BOUNDARY: Safe Data Extraction
 * Rationale: Matrix payloads are heterogeneous arrays. We enforce schema-based
 * normalization at the extraction point to ensure "Defense in Depth".
 */
const SafeStringSchema = v.pipe(
  v.unknown(),
  v.transform((val) => (val === null || val === undefined ? "" : String(val)))
);

const SafeNumberSchema = v.pipe(
  v.unknown(),
  v.transform((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/,/g, "").replace(/%/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  })
);

const SafeTimestampSchema = v.pipe(
  v.unknown(),
  v.transform((val) => {
    if (!val) return 0;
    const date = new Date(String(val));
    const time = date.getTime();
    return isNaN(time) ? 0 : time;
  })
);

/**
 * Maps a single Leaderboard row to a LeaderboardMember object.
 * Uses direct index access for maximum performance.
 */
export function mapLbRow(rowSnapshot: unknown[], schemaMap: Record<string, number>): LeaderboardMember | null {
  if (!rowSnapshot || !Array.isArray(rowSnapshot)) return null;

  // [PERF] Optimized field access (with fallbacks for legacy keys 's' and 'r')
  // Rationale: Avoids breaking the UI if the backend is rolled back to a legacy schema.
  const perfScore = rowSnapshot[schemaMap["performanceScore"]] ?? rowSnapshot[schemaMap["s"]];
  const perfRaw = rowSnapshot[schemaMap["performanceRawScore"]] ?? rowSnapshot[schemaMap["r"]];

  return {
    id: v.parse(SafeStringSchema, rowSnapshot[schemaMap["id"]]),
    n: v.parse(SafeStringSchema, rowSnapshot[schemaMap["n"]]),
    t: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["t"]]),
    performanceScore: v.parse(SafeNumberSchema, perfScore),
    performanceRawScore: v.parse(SafeNumberSchema, perfRaw),
    dt: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["dt"]]),
    d: {
      role: v.parse(SafeStringSchema, rowSnapshot[schemaMap["role"]]),
      days: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["days"]]),
      avg: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["avg"]]),
      seen: v.parse(SafeStringSchema, rowSnapshot[schemaMap["seen"]] || "-"),
      rate: v.parse(SafeStringSchema, rowSnapshot[schemaMap["rate"]] || "0%"),
      wfame: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["wfame"]]),
      hist: v.parse(SafeStringSchema, rowSnapshot[schemaMap["hist"]]),
    },
  };
}

/**
 * Maps a single Headhunter row to a Recruit object.
 * Uses direct index access for maximum performance.
 */
export function mapHhRow(rowSnapshot: unknown[], schemaMap: Record<string, number>): Recruit | null {
  if (!rowSnapshot || !Array.isArray(rowSnapshot)) return null;

  return {
    id: v.parse(SafeStringSchema, rowSnapshot[schemaMap["id"]]),
    n: v.parse(SafeStringSchema, rowSnapshot[schemaMap["n"]]),
    t: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["t"]]),
    potentialScore: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["potentialScore"]]),
    potentialRawScore: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["potentialRawScore"]]),
    lastScan: v.parse(SafeTimestampSchema, rowSnapshot[schemaMap["lastScan"]]),
    d: {
      don: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["don"]]),
      war: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["war"]]),
      ago: v.parse(SafeStringSchema, rowSnapshot[schemaMap["ago"]]) || new Date().toISOString(),
      cards: v.parse(SafeNumberSchema, rowSnapshot[schemaMap["cards"]]),
    },
  };
}

/**
 * Transforms a compressed matrix payload into a structured WebAppData object.
 *
 * @remarks
 * The backend sends data as a 'matrix' (arrays of arrays) to save up to 70%
 * in payload size by not repeating field names for every record. This function
 * uses a schema map to "re-hydrate" the records into typed objects.
 *
 * @param data - The raw JSON or string payload from the backend.
 * @returns A fully inflated WebAppData object ready for the UI.
 * @throws Error if the payload is malformed or invalid.
 */
export async function inflatePayload(data: unknown): Promise<WebAppData> {
  let parsedData: unknown;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      throw new Error("Failed to parse data string");
    }
  } else {
    parsedData = data;
  }

  if (!parsedData || typeof parsedData !== "object" || parsedData === null) {
    throw new Error("Invalid payload: data is null or not an object");
  }

  const typedData = parsedData as Record<string, unknown>;

  // [GUARD] VALIDATION BOUNDARY: Target III - Data Integrity
  // Enforce strict schema validation for all incoming data to prevent "any Plague"
  // from propagating into the core application state.
  if (typedData.format !== "matrix") {
    // THREAT: Unvalidated object payload could crash the Clean Stack.
    const validated = v.parse(BaseWebAppDataSchema, typedData);
    return {
      ...validated,
      timestamp: Number(validated.timestamp) || Date.now(),
    };
  }

  // MATRIX TRANSFORMATION: Re-hydrating compressed arrays into structured objects.
  // Rationale: Saves ~70% in JSON payload size by not repeating keys per record.
  const source = v.parse(WebAppDataSchema, parsedData);

  const lbMatrix = Array.isArray(source.lb) ? source.lb : [];
  const hhMatrix = Array.isArray(source.hh) ? source.hh : [];
  
  // SCHEMA FALLBACK: Ensures forward compatibility with older GAS deployments (V10 standard).
  let lbSchemaArr = source.schema?.lb;
  let hhSchemaArr = source.schema?.hh;

  if (!lbSchemaArr || !Array.isArray(lbSchemaArr) || lbSchemaArr.length === 0) {
    lbSchemaArr = DEFAULT_LB_SCHEMA;
  }
  
  if (!hhSchemaArr || !Array.isArray(hhSchemaArr) || hhSchemaArr.length === 0) {
    hhSchemaArr = DEFAULT_HH_SCHEMA;
  }

  // Pre-calculate Schema Maps (O(S))
  const lbMap = createSchemaMap(lbSchemaArr);
  const hhMap = createSchemaMap(hhSchemaArr);

  return {
    lb: lbMatrix
      .map((rowSnapshot) => mapLbRow(rowSnapshot as unknown[], lbMap))
      .filter((rowSnapshot): rowSnapshot is LeaderboardMember => !!rowSnapshot),
    hh: hhMatrix
      .map((rowSnapshot) => mapHhRow(rowSnapshot as unknown[], hhMap))
      .filter((rowSnapshot): rowSnapshot is Recruit => !!rowSnapshot),
    playerTag: source.playerTag,
    timestamp: Number(source.timestamp) || Date.now(),
  };
}

/**
 * Executes a network fetch with built-in retry logic and jittered exponential backoff.
 *
 * @param url - The full destination URL.
 * @param options - Standard RequestInit options.
 * @param retries - Number of remaining attempts (defaults to 4).
 * @param backoff - Starting delay in milliseconds (defaults to 2000ms).
 * @returns The successful Fetch Response.
 * @throws NetworkError if all retries are exhausted.
 * @throws AbortError if the request was cancelled by the caller.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 4,
  backoff = 2000,
): Promise<Response> {
  const controller = new AbortController();
  //  RELIABILITY: Increased timeout to 45s for slow GAS executions
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), 45000);

  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store", //  RELIABILITY: Prevent stale redirects or "Blocked" responses
      signal: options.signal || controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    }
    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    //  RECOGNITION: Correctly identify if the error was a deliberate abort vs timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    if (retries > 0) {
      // JITTERED EXPONENTIAL BACKOFF: Target IV - Resilience
      // Helps mitigate transient network congestion and prevents "thundering herd"
      // issues during server recovery or GAS quota reset periods.
      const jitter = Math.random() * 800;
      await new Promise((r) => setTimeout(r, backoff + jitter));
      return fetchWithRetry(url, options, retries - 1, backoff * 1.8);
    }
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new NetworkError(message);
  }
}

type GasRequestOptions = {
  signal?: AbortSignal;
  force?: boolean;
};

/**
 * Orchestrates a routed request to the Google Apps Script backend.
 *
 * @remarks
 * Implements a Singleton Pattern for pending requests; multiple calls for
 * the same action/payload within the same tick will share the same promise.
 *
 * @param action - The backend command identifier (routes to the GAS switch block).
 * @param payload - Optional data to send with the request.
 * @param options - Coordination options (signal for cancellation, force for cache bypass).
 * @returns The generic data type T returned by the backend.
 */
async function gasRequest<T>(
  action: string,
  payload?: Record<string, unknown>,
  options?: GasRequestOptions,
): Promise<T> {
  const requestKey = JSON.stringify({ action, payload });

  // [PERF] Request Deduplication: Singleton Pattern
  // Rationale: Prevents redundant network traffic if multiple components trigger the
  // same action within the same event loop tick.
  if (pendingRequests.has(requestKey) && !options?.force) {
    return pendingRequests.get(requestKey)!;
  }

  const requestPromise = (async () => {
    try {
      return await _executeGasRequest<T>(action, payload, options);
    } finally {
      pendingRequests.delete(requestKey);
    }
  })();

  pendingRequests.set(requestKey, requestPromise);
  return requestPromise;
}

async function _executeGasRequest<T>(
  action: string,
  payload?: Record<string, unknown>,
  options?: GasRequestOptions,
): Promise<T> {
  const url = getGasUrl();
  if (!url) throw new Error("GAS_URL not configured.");

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload }),
    signal: options?.signal,
  };

  //  MANDATORY: GAS requires 'action' in the URL for proper routing and redirects.
  // Cache busting is also essential to prevent the browser from skipping the redirect.
  const separator = url.includes("?") ? "&" : "?";
  const requestUrl = `${url}${separator}action=${action}&_cb=${Date.now()}`;

  try {
    const response = await fetchWithRetry(requestUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      throw new Error("Empty Response from Server");
    }

    // [GUARD] AUTH/CRASH DETECTION: Target IV - Resilience
    // Google Apps Script returns HTML (starting with '<') instead of JSON
    // when a session expires, permissions are revoked, or the script
    // crashes at the global scope. Catching this early prevents 'Unexpected
    // Token' syntax errors during JSON.parse.
    if (text.trim().startsWith("<")) {
      console.warn("GAS returned HTML instead of JSON. Possible Auth/Config issue:", text.substring(0, 100));
      throw new Error("Backend Configuration Error (HTML Response)");
    }

    let envelope: GenericEnvelope<T>;
    try {
      envelope = JSON.parse(text);
    } catch (e) {
      throw new Error("Malformed JSON Response from Backend");
    }

    const isSuccess =
      envelope.success === true ||
      (envelope.status && envelope.status.toLowerCase() === "success") ||
      (envelope.data && !envelope.error);

    if (isSuccess) {
      return (envelope.data !== undefined ? envelope.data : envelope) as T;
    }

    const errorMessage =
      envelope.error?.message || envelope.message || "Operation failed on server";
    throw new Error(errorMessage);
  } catch (error: unknown) {
    // ABORT HANDLING
    // We only throw immediately if the request was cancelled by the UI (replaced).
    // If it's a timeout, we treat it as a background-syncable event.
    if (error instanceof Error && error.name === "AbortError") {
      if (error.message !== "replaced") {
        console.warn(`[API] Request timed out. Enqueuing for background sync: ${action}`);
        await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });
      }
      throw error;
    }
    
    // Offline Queue logic
    if (action !== 'ping' && action !== 'getwebappdata') {
      await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const syncManager = (reg as any).sync;
          if (syncManager) {
            await syncManager.register("offline-queue-sync");
          }
        } catch (syncErr) {
          /* fail silent on sync registration */
        }
      }
    }

    throw error;
  }
}

async function enqueueOfflineRequest(request: Record<string, unknown>) {
  const queue = (await idb.get<unknown[]>("offline_queue")) || [];
  queue.push(request);
  await idb.set("offline_queue", queue);
}

/**
 * Loads the WebAppData from the persistent browser cache.
 */
export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

/**
 * Persists the WebAppData to the browser's IndexedDB.
 */
export async function saveCache(data: WebAppData): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}

/**
 * Orchestrates high-integrity data retrieval from the remote backend.
 *
 * @remarks
 * Implements a "Circuit Breaker" pattern (Target IV - Resilience):
 * 1. WORKER HUB: Attempts to fetch fresh data from the Node Worker first.
 *    - Deadline: 3000ms. If the worker stalls, the request is aborted.
 *    - Rationale: Workers offer sub-100ms response times compared to GAS.
 * 2. GAS FALLBACK: If the worker is offline, times out, or returns invalid data,
 *    the client falls back to the authoritative GAS backend.
 *
 * @param options - AbortSignal for UI cancellation and force refresh flag.
 * @returns Fully re-hydrated and validated WebAppData.
 * @sideeffects Persists the result to IndexedDB on success.
 */
export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  const useWorkerHub = import.meta.env.VITE_USE_WORKER_HUB === "true";

  if (useWorkerHub) {
    try {
      // PHASE 1: Try Worker Hub (Optimistic)
      const workerUrl = getWorkerUrl() + "/hub/state";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s deadline
      
      if (options?.signal) {
        options.signal.addEventListener("abort", () => controller.abort());
      }

      const workerResponse = await fetch(workerUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!workerResponse.ok) throw new Error("Worker Hub HTTP " + workerResponse.status);
      const workerPayload = await workerResponse.json();
      if (!workerPayload.success || !workerPayload.data) throw new Error("Worker Hub malformed payload");

      // [GUARD] VALIDATION BOUNDARY: Target B [1] hardening.
      // Enforce strict schema validation for the HubState returned by the worker.
      // Rationale: Every external boundary is a potential entry point for hostile or malformed input.
      const validationResult = v.safeParse(HubStateSchema, workerPayload.data);

      if (!validationResult.success) {
        // THREAT: Malformed matrix data from Worker Hub causing downstream PWA crashes.
        console.error("[WorkerHub] Matrix validation failed:", validationResult.issues);
        throw new Error("Worker Hub returned malformed or unvalidated table data.");
      }

      const validatedHubState = validationResult.output;
      const rosterTable = validatedHubState.data.roster;
      const hhTable = validatedHubState.data.headhunter;

      // MATRIX RE-HYDRATION: Transform Hub matrix format into GAS format
      // Rationale: Reusing `inflatePayload` ensures a single validation boundary (Target III).
      const timestamp = new Date(validatedHubState.metadata.timestamp).getTime() || Date.now();

      const mappedData: any = {
        format: "matrix",
        timestamp,
        playerTag: "", 
        schema: {
          lb: rosterTable.headers,
          hh: hhTable.headers
        },
        lb: rosterTable.rows,
        hh: hhTable.rows
      };

      const inflated = await inflatePayload(mappedData);
      
      // OBSERVABILITY: Label the data source for system diagnostics
      Object.assign(inflated, { 
        dataSource: "WORKER",
        hubTimestamp: timestamp 
      });

      idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
      return inflated;
    } catch (workerFetchError: unknown) {
      if (workerFetchError instanceof Error && workerFetchError.name === "AbortError" && options?.signal?.aborted) {
        throw workerFetchError; // Honor explicit UI cancellation without triggering GAS fallback
      }
      // RECOVERY: Log failure and continue to legacy GAS fetch
      // Target B [4]: Harden error 'e' to 'unknown' with narrowing.
      const errorMsg = workerFetchError instanceof Error ? workerFetchError.message : String(workerFetchError);
      console.warn(`[WorkerHub] Fetch failed, falling back to GAS: ${errorMsg}`);
    }
  }

  // PHASE 2: Authority Fallback (GAS)
  const action = options?.force ? "refresh" : "getwebappdata";
  const data = await gasRequest<unknown>(action, undefined, {
    signal: options?.signal,
  });

  if (!data) throw new Error("Invalid response structure");

  const inflated = await inflatePayload(data);
  
  Object.assign(inflated, { dataSource: "GAS" });
  
  idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
  return inflated;
}

/**
 * Performs a simple connectivity check against the GAS backend.
 */
export async function ping(options?: GasRequestOptions): Promise<PingResponse> {
  return gasRequest<PingResponse>("ping", undefined, options);
}

/**
 * Fetches a comprehensive player profile, re-hydrating it into a unified Domain Model.
 * Enforces Target B [1] validation boundary using ProfileInputSchema.
 */
export async function getPlayerProfile(
  tag: string,
): Promise<v.InferOutput<typeof ProfileInputSchema>> {
  const profile = await gasRequest<unknown>("getPlayerProfile", { tag });
  return v.parse(ProfileInputSchema, profile);
}

/**
 * Dispatches a batch dismissal request to the GAS backend.
 *
 * @remarks
 * Implements a "Hybrid Compatibility" payload: sends both legacy tag IDs
 * and modern score-aware objects to ensure safe transitions between deployments.
 */
export async function dismissRecruits(
  items: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  return gasRequest<ApiResponse<DismissResponse>>("dismissRecruits", { 
    items,
    ids: items.map(i => i.id)
  });
}

/**
 * Reverts a previous dismissal for the specified recruit tags.
 */
export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  return gasRequest<ApiResponse<DismissResponse>>("undismissRecruits", { ids });
}

/**
 * Signals the GAS backend to trigger an immediate external update or key audit.
 */
export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return gasRequest<ApiResponse<{ success: boolean; message: string }>>(
    "triggerUpdate",
    { target },
  );
}

/**
 * Triggers a direct recruitment scan via the remote Worker API.
 *
 * @remarks
 * This function bypasses the GAS backend to leverage the Worker's direct
 * connection to the Royale API. It implements a strict validation boundary
 * (Target B [1]) using Valibot to ensure external payloads do not pollute
 * internal recruitment logic.
 *
 * @returns An array of Recruit objects on success, or null if the scan
 * fails or validation fails.
 */
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return null;

  try {
    const res = await fetch(`${workerUrl}/public/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: ["2CCCP", "9U9Q9", "29UQQ282", "200000"],
        scoring: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }
      })
    });

    if (!res.ok) throw new Error(`Worker status ${res.status}`);
    const json = await res.json();

    // [GUARD] VALIDATION BOUNDARY: Implements Target B [1] hardening.
    // Enforces strict schema validation for data returned from the remote worker
    // to prevent unvalidated external payloads from polluting the recruitment logic.
    const result = v.safeParse(WorkerScanResponseSchema, json);
    
    if (!result.success) {
      // THREAT: Malformed or malicious worker response causing downstream UI crashes or logic errors.
      console.warn("[GasClient] Worker scan validation failed", result.issues);
      return null;
    }

    return result.output.candidates.map((c) => ({
      id: c.tag.replace("#", ""),
      n: c.name,
      t: c.trophies,
      potentialScore: Math.min(100, Math.round((c.rawScore / 50000) * 100)),
      potentialRawScore: c.rawScore,
      d: {
        don: c.donations,
        war: c.war,
        cards: c.cards,
        ago: new Date().toISOString()
      },
      lastScan: 0
    }));
  } catch (error: unknown) {
    console.warn("[GasClient] Worker scan failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Registers a PushSubscription with the remote Worker.
 *
 * @param subscription - The standard browser PushSubscription object.
 * @returns Boolean indicating if the subscription was successfully registered.
 */
export async function subscribeToPush(subscription: PushSubscription): Promise<boolean> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return false;

  try {
    await fetch(`${workerUrl}/public/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription)
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Checks if the GAS API URL is configured in the current environment.
 *
 * @returns True if a valid GAS URL is present in LocalStorage or Env.
 */
export function isConfigured(): boolean {
  return Boolean(getGasUrl());
}

/**
 * Returns the currently active GAS API endpoint.
 *
 * @returns The resolved URL string, or a placeholder if unconfigured.
 */
export function getApiUrl(): string {
  return getGasUrl() || "(not configured)";
}

/**
 * Checks if the Worker API URL is configured in the current environment.
 *
 * @returns True if a valid Worker URL is present.
 */
export function isWorkerConfigured(): boolean {
  return Boolean(getWorkerUrl());
}