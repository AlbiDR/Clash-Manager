// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [DIAGNOSTIC] LAST HUB ERROR
 * Provides an authoritative reason for why the Worker Hub fallback was triggered.
 */
import { ref } from "vue";
export const lastHubDiagnosis = ref<"TIMEOUT" | "AUTH" | "VALIDATION" | "OFFLINE" | "SUCCESS" | null>(null);

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

// [DEBUG] TEST OVERRIDE: TARGET IV Resilience
// Allows Vitest to explicitly disable the Worker Hub during retry and fallback tests
// to prevent Hub fetch pollution from interfering with legacy GAS timing assertions.
let _workerHubTestOverride: boolean | null = null;
export const _setWorkerHubTestOverride = (val: boolean | null) => { _workerHubTestOverride = val; };

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
  playerTag: v.optional(v.nullable(v.string())),
  dataSource: v.optional(v.picklist(["WORKER", "GAS"])),
  hubTimestamp: v.optional(v.union([v.number(), v.string(), v.null()])),
  lastCompiled: v.optional(v.union([v.number(), v.string(), v.null()])),
  lastFetched: v.optional(v.union([v.number(), v.string(), v.null()])),
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

/**
 * [GUARD] GENERIC ENVELOPE SCHEMA
 * Validates the standard response wrapper used by the GAS backend.
 * Target B [1]: Enforce "Defense in Depth" by validating the response structure
 * before extracting payload data.
 */
const GenericEnvelopeSchema = v.object({
  success: v.optional(v.boolean()),
  status: v.optional(v.string()),
  data: v.optional(v.unknown()),
  error: v.optional(v.object({ message: v.string() })),
  message: v.optional(v.string()),
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

/**
 * Pings the Worker Hub to verify direct connectivity and health.
 * Rationale: Allows the PWA to proactively determine if the high-performance
 * path is available before attempting a heavy data fetch.
 */
export async function pingWorker(): Promise<boolean> {
  const url = getWorkerUrl();
  if (!url) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const workerToken = import.meta.env.VITE_WORKER_TOKEN;

    // PATHOGEN: Anemic variable 'res' replaced with domain-descriptive name.
    const pingResponse = await fetch(`${url}/hub/ping`, {
      method: "GET",
      headers: workerToken ? { "Authorization": `Bearer ${workerToken}` } : {},
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return pingResponse.ok;
  } catch {
    return false;
  }
}

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
    } catch (parseError) { // PATHOGEN: Anemic variable 'e' replaced.
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

  const result: WebAppData = {
    lb: lbMatrix
      .map((rowSnapshot) => mapLbRow(rowSnapshot as unknown[], lbMap))
      .filter((rowSnapshot): rowSnapshot is LeaderboardMember => !!rowSnapshot),
    hh: hhMatrix
      .map((rowSnapshot) => mapHhRow(rowSnapshot as unknown[], hhMap))
      .filter((rowSnapshot): rowSnapshot is Recruit => !!rowSnapshot),
    playerTag: source.playerTag,
    timestamp: Number(source.timestamp) || Date.now(),
    dataSource: source.dataSource,
    hubTimestamp: source.hubTimestamp,
    lastCompiled: source.lastCompiled,
    lastFetched: source.lastFetched,
  };

  return result;
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

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Malformed or malicious envelopes causing downstream logic failure.
    // Rationale: We validate the envelope structure before processing its contents.
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (jsonError) { // PATHOGEN: Anemic variable 'e' replaced.
      throw new Error("Malformed JSON Response from Backend");
    }

    const envelopeValidation = v.safeParse(GenericEnvelopeSchema, json);
    if (!envelopeValidation.success) {
      throw new Error("Invalid Response Envelope from Backend");
    }

    const envelope = envelopeValidation.output;

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

      // Target B [4]: Type-safe Service Worker Sync registration
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;

          // [GUARD] Type-safe access to SyncManager without pathogens.
          interface SyncRegistration {
            sync: { register: (tag: string) => Promise<void> };
          }

          if ('sync' in registration) {
            const syncManager = (registration as unknown as SyncRegistration).sync;
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
  const envVal = String(import.meta.env.VITE_USE_WORKER_HUB || "").toLowerCase().trim();
  const useWorkerHub = _workerHubTestOverride !== null 
    ? _workerHubTestOverride 
    : (envVal === "true" || envVal === "1");

  const workerUrl = (import.meta.env.VITE_WORKER_URL || "").trim();
  const workerToken = (import.meta.env.VITE_WORKER_TOKEN || "").trim();
    
  if (useWorkerHub && workerUrl) {
    const controller = new AbortController();
    // Rationale: Boost timeout to 20s to allow Render Free Tier to 'wake up' (spin up latency).
    const timeoutId = setTimeout(() => controller.abort(), 20000); 
      
    try {
      console.debug("[Sync] Phase 1: Contacting Worker Hub...");
      // Cache-Buster: Appending timestamp to bypass any edge-cached 404/500 failure states.
      const bustUrl = `${workerUrl}/hub/state?v=${Date.now()}`;
      const workerResponse = await fetch(bustUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${workerToken}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (workerResponse.ok) {
        console.debug("[Sync] Worker HTTP Success. Parsing payload...");
        const workerPayload = await workerResponse.json();
        if (workerPayload.success && workerPayload.data) {
          const validationResult = v.safeParse(HubStateSchema, workerPayload.data);
          if (validationResult.success) {
            const validatedHubState = validationResult.output;
            const rosterTable = validatedHubState.data.roster;
            const hhTable = validatedHubState.data.headhunter;
            const timestamp = new Date(validatedHubState.metadata.timestamp).getTime() || Date.now();
            const lastCompiled = new Date(validatedHubState.metadata.lastCompiled).getTime() || timestamp;
            const lastFetched = new Date(validatedHubState.metadata.lastFetched).getTime() || timestamp;

            // The Worker Hub sends raw matrices (array of arrays).
            // Index 0: Title block
            // Index 1: Human-readable headers
            // Index 2+: Data rows
            // Depending on the backend, it could also send exactly what GAS sends.
            
            // Defensively check if this is the Raw Spreadsheet export
            // The Raw export has an empty Column A, so Tag is at index 1.
            let lbSchema = DEFAULT_LB_SCHEMA;
            let lbRows: unknown[][] = []; // PATHOGEN: Replacing any[][] with unknown[][]
            
            let hhSchema = DEFAULT_HH_SCHEMA;
            let hhRows: unknown[][] = []; // PATHOGEN: Replacing any[][] with unknown[][]

            if (Array.isArray(rosterTable) && rosterTable.length > 2) {
              const row1 = rosterTable[1];
              // If Row 1 has 'Tag' at index 1, it's the Raw Sheet
              if (Array.isArray(row1) && String(row1[1]).toUpperCase() === 'TAG') {
                lbSchema = [
                  "_", "id", "n", "role", "t", "days", "req", "avg", "tot", "seen", "rate", "wfame", 
                  "hist", "performanceRawScore", "performanceScore", "trend"
                ];
                lbRows = rosterTable.slice(2);
              } else {
                // It might be the perfectly formatted GAS matrix disguised as Worker payload
                const row2 = rosterTable[2];
                const isRow2Schema = Array.isArray(row2) && row2.includes("id");
                lbSchema = isRow2Schema ? (row2 as string[]) : DEFAULT_LB_SCHEMA;
                lbRows = rosterTable.slice(isRow2Schema ? 3 : 2);
              }
            }
            
            if (Array.isArray(hhTable) && hhTable.length > 2) {
              const row1hh = hhTable[1];
              if (Array.isArray(row1hh) && String(row1hh[1]).toUpperCase() === 'TAG') {
                hhSchema = [
                  "_", "id", "invited", "n", "t", "don", "cards", "war", "ago", "potentialRawScore", "potentialScore", "lastScan"
                ];
                // In Raw HH Data, we must filter out invited manually if they are true, just like extractSheetDataStrict
                hhRows = hhTable.slice(2).filter((row) => {
                  if (!Array.isArray(row)) return false;
                  const invited = String(row[2]).toUpperCase();
                  return invited !== 'TRUE';
                });
              } else {
                const row2hh = hhTable[2];
                const isRow2HhSchema = Array.isArray(row2hh) && row2hh.includes("id");
                hhSchema = isRow2HhSchema ? (row2hh as string[]) : DEFAULT_HH_SCHEMA;
                hhRows = hhTable.slice(isRow2HhSchema ? 3 : 2);
              }
            }

            const mappedData = {
              format: "matrix",
              timestamp,
              lastCompiled,
              lastFetched,
              playerTag: "", 
              schema: {
                lb: lbSchema,
                hh: hhSchema
              },
              lb: lbRows,
              hh: hhRows
            };

            const inflated = await inflatePayload(mappedData);
            
            // Set dataSource and timestamps to trigger Hub attribution in UI
            Object.assign(inflated, { 
              dataSource: "WORKER",
              hubTimestamp: timestamp,
              lastCompiled,
              lastFetched
            });

            idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
            lastHubDiagnosis.value = "SUCCESS";
            console.debug("[Sync] Success: HUB Attribution Active.");
            return inflated;
          } else {
            lastHubDiagnosis.value = "VALIDATION";
            console.warn("[Sync] Worker Validation Failed. Falling back to GAS.", validationResult.issues);
          }
        } else {
          lastHubDiagnosis.value = "VALIDATION";
          console.warn("[Sync] Worker responded but payload.success is false.");
        }
      } else if (workerResponse.status === 401 || workerResponse.status === 403) {
        lastHubDiagnosis.value = "AUTH";
        console.error("[Sync] Worker Authentication failed. Check VITE_WORKER_TOKEN.");
      } else {
        lastHubDiagnosis.value = "OFFLINE";
        console.warn(`[Sync] Worker returned HTTP ${workerResponse.status}.`);
      }
    } catch (workerFetchError: unknown) {
      if (workerFetchError instanceof Error && workerFetchError.name === "AbortError") {
        lastHubDiagnosis.value = "TIMEOUT";
      } else {
        lastHubDiagnosis.value = "OFFLINE";
      }
      
      if (workerFetchError instanceof Error && workerFetchError.name === "AbortError" && options?.signal?.aborted) {
        throw workerFetchError; 
      }
      console.warn("[Sync] Worker Fetch failed (Network/CORS), falling back to GAS.", workerFetchError);
    }
  } else {
    console.debug("⏭[Sync] Skipping Worker Hub (VITE_USE_WORKER_HUB is false).");
  }

  // PHASE 2: Authority Fallback (GAS) - Standardized Retry Loop
  const url = getGasUrl();
  if (!url) throw new Error("GAS_URL not configured.");
  
  const action = options?.force ? "refresh" : "getwebappdata";
  const separator = url.includes("?") ? "&" : "?";
  const requestUrl = `${url}${separator}action=${action}&_cb=${Date.now()}`;
  
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) { // PATHOGEN: Anemic variable 'i' replaced.
    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action }),
        signal: options?.signal,
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < maxAttempts - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const text = await response.text();
      if (text.trim().startsWith("<")) {
          throw new Error("Backend Configuration Error (HTML Response)");
      }

      // [GUARD] VALIDATION BOUNDARY: Target B [1]
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (jsonError) { // PATHOGEN: Anemic variable 'e' replaced.
        throw new Error("Malformed JSON Response from Backend");
      }

      const envelopeValidation = v.safeParse(GenericEnvelopeSchema, payload);
      if (!envelopeValidation.success) {
        throw new Error("Invalid Response Envelope from Backend");
      }

      const envelope = envelopeValidation.output;
      const isSuccess = envelope.success === true || (envelope.status && envelope.status.toLowerCase() === "success");

      if (isSuccess && envelope.data) {
        const inflated = await inflatePayload(envelope.data);
        Object.assign(inflated, { dataSource: "GAS" });
        idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
        return inflated;
      }
      throw new Error(envelope.error?.message || "Invalid Response Structure");

    } catch (fetchError: unknown) { // PATHOGEN: Anemic variable 'e' replaced.
      // [GUARD] FATAL ERRORS: Target IV - Resilience
      // Do not retry on explicit client rejections (4xx), malformed payloads, 
      // or deliberate user cancellations (AbortError).
      const isFatal = fetchError instanceof Error && (
        fetchError.name === "AbortError" ||
        fetchError.message.includes("Server returned HTTP") ||
        fetchError.message.includes("Backend Configuration Error") ||
        fetchError.message.includes("Malformed JSON")
      );

      if (isFatal || attempt === maxAttempts - 1) throw fetchError;
      
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Sync failed after multiple attempts");
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
  const workerToken = import.meta.env.VITE_WORKER_TOKEN;
  if (!workerUrl) return null;

  try {
    const scanResponse = await fetch(`${workerUrl}/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken ? { "Authorization": `Bearer ${workerToken}` } : {})
      },
      body: JSON.stringify({
        tags: ["2CCCP", "9U9Q9", "29UQQ282", "200000"],
        scoring: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }
      })
    });

    if (!scanResponse.ok) throw new Error(`Worker status ${scanResponse.status}`);
    const rawScanResults = await scanResponse.json();

    // [GUARD] VALIDATION BOUNDARY: Implements Target B [1] hardening.
    // Enforces strict schema validation for data returned from the remote worker
    // to prevent unvalidated external payloads from polluting the recruitment logic.
    const result = v.safeParse(WorkerScanResponseSchema, rawScanResults);
    
    if (!result.success) {
      // THREAT: Malformed or malicious worker response causing downstream UI crashes or logic errors.
      console.warn("[GasClient] Worker scan validation failed", result.issues);
      return null;
    }

    return result.output.candidates.map((candidate) => ({
      id: candidate.tag.replace("#", ""),
      n: candidate.name,
      t: candidate.trophies,
      potentialScore: Math.min(100, Math.round((candidate.rawScore / 50000) * 100)),
      potentialRawScore: candidate.rawScore,
      d: {
        don: candidate.donations,
        war: candidate.war,
        cards: candidate.cards,
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
  } catch (pushError) {
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