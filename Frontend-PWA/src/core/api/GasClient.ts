/**
 * ============================================================================
 * MODULE: API CLIENT (THE BRIDGE)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The primary communication layer between the PWA, the Google
 * Apps Script (GAS) backend, and the high-performance Worker subsystem.
 *
 * ARCHITECTURE:
 *  - Hybrid Transport: Combines a POST-only GAS protocol for persistent
 *    storage with direct JSON/REST communication for Worker-side operations.
 *  - Matrix Inflation: GAS payloads are transmitted as optimized arrays
 *    of arrays to minimize JSON overhead before being re-hydrated.
 *  - Offline Resiliency: Integrated with IndexedDB and a background sync
 *    queue for unreliable network environments.
 *
 * PERFORMANCE:
 *  - Uses 'text/plain' for GAS to bypass CORS preflight (OPTIONS) overhead.
 *  - Implements exponential backoff and request deduplication.
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
const pendingRequests = new Map<string, Promise<any>>();

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

const safeStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const safeNum = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").replace(/%/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

/**
 * Maps a single Leaderboard row to a LeaderboardMember object.
 * Uses direct index access for maximum performance.
 */
export function mapLbRow(row: unknown[], m: Record<string, number>): LeaderboardMember | null {
  if (!row || !Array.isArray(row)) return null;

  // Optimized field access (with fallbacks for legacy keys 's' and 'r')
  const perfScore = row[m["performanceScore"]] ?? row[m["s"]];
  const perfRaw = row[m["performanceRawScore"]] ?? row[m["r"]];

  return {
    id: safeStr(row[m["id"]]),
    n: safeStr(row[m["n"]]),
    t: safeNum(row[m["t"]]),
    performanceScore: safeNum(perfScore),
    performanceRawScore: safeNum(perfRaw),
    dt: safeNum(row[m["dt"]]),
    d: {
      role: safeStr(row[m["role"]]),
      days: safeNum(row[m["days"]]),
      avg: safeNum(row[m["avg"]]),
      seen: safeStr(row[m["seen"]] || "-"),
      rate: safeStr(row[m["rate"]] || "0%"),
      wfame: safeNum(row[m["wfame"]]),
      hist: safeStr(row[m["hist"]]),
    },
  };
}

/**
 * Maps a single Headhunter row to a Recruit object.
 * Uses direct index access for maximum performance.
 */
export function mapHhRow(row: unknown[], m: Record<string, number>): Recruit | null {
  if (!row || !Array.isArray(row)) return null;

  return {
    id: safeStr(row[m["id"]]),
    n: safeStr(row[m["n"]]),
    t: safeNum(row[m["t"]]),
    potentialScore: safeNum(row[m["potentialScore"]]),
    potentialRawScore: safeNum(row[m["potentialRawScore"]]),
    lastScan: row[m["lastScan"]] ? new Date(row[m["lastScan"]] as string).getTime() : 0,
    d: {
      don: safeNum(row[m["don"]]),
      war: safeNum(row[m["war"]]),
      ago: safeStr(row[m["ago"]]) || new Date().toISOString(),
      cards: safeNum(row[m["cards"]]),
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

  if (!parsedData || typeof parsedData !== "object") {
    throw new Error("Invalid payload: data is null or not an object");
  }

  //  VALIDATION BOUNDARY: Enforce strict schema validation for all incoming data
  if ((parsedData as any).format !== "matrix") {
    //  THREAT: Unvalidated object payload could crash the Clean Stack.
    const validated = v.parse(BaseWebAppDataSchema, parsedData);
    return {
      ...validated,
      timestamp: Number(validated.timestamp) || Date.now(),
    };
  }

  // Matrix format requires transformation after validation
  const source = v.parse(WebAppDataSchema, parsedData);

  const lbMatrix = Array.isArray(source.lb) ? source.lb : [];
  const hhMatrix = Array.isArray(source.hh) ? source.hh : [];
  
  //  SCHEMA FALLBACK: Use provided schema or default to standard V10 structure
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
      .map((r) => mapLbRow(r as unknown[], lbMap))
      .filter((r): r is LeaderboardMember => !!r),
    hh: hhMatrix
      .map((r) => mapHhRow(r as unknown[], hhMap))
      .filter((r): r is Recruit => !!r),
    playerTag: source.playerTag,
    timestamp: Number(source.timestamp) || Date.now(),
  };
}

/**
 * Executes a network fetch with built-in retry logic and exponential backoff.
 *
 * @param url - The full destination URL.
 * @param options - Standard RequestInit options.
 * @param retries - Number of remaining attempts (defaults to 3).
 * @param backoff - Starting delay in milliseconds (defaults to 1000ms).
 * @returns The successful Fetch Response.
 * @throws NetworkError if all retries are exhausted.
 * @throws AbortError if the request was cancelled by the caller.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), 30000);

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
  } catch (e: any) {
    clearTimeout(timeoutId);
    
    //  RECOGNITION: Correctly identify if the error was a deliberate abort vs timeout
    if (e.name === "AbortError") {
      throw e; 
    }

    if (retries > 0) {
      //  EXPONENTIAL BACKOFF: Multiplier of 1.5 helps mitigate transient
      // network congestion without overwhelming the server during recovery.
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
    }
    throw new NetworkError(e.message || "Network request failed");
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

    //  AUTH/CRASH DETECTION:
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
  } catch (e: any) {
    // ABORT HANDLING
    // We only throw immediately if the request was cancelled by the UI (replaced).
    // If it's a timeout, we treat it as a background-syncable event.
    if (e.name === "AbortError") {
      if (e.message !== "replaced") {
        console.warn(`[API] Request timed out. Enqueuing for background sync: ${action}`);
        await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });
      }
      throw e; 
    }
    
    // Offline Queue logic
    if (action !== 'ping' && action !== 'getwebappdata') {
      await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await (reg as any).sync.register("offline-queue-sync");
        } catch (syncErr) {}
      }
    }

    throw e; 
  }
}

async function enqueueOfflineRequest(request: any) {
  const queue = (await idb.get<any[]>("offline_queue")) || [];
  queue.push(request);
  await idb.set("offline_queue", queue);
}

export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

export async function saveCache(data: WebAppData): Promise<void> {
  return idb.set(CACHE_KEY_MAIN, data);
}

/**
 * High-level helper to refresh application data from the remote backend.
 *
 * @param options - Object containing AbortSignal and force refresh flag.
 * @returns The fully inflated and validated WebAppData.
 * @sideeffects Updates the IndexedDB 'CLAN_MANAGER_DATA_V7' cache.
 */
export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  const action = options?.force ? "refresh" : "getwebappdata";
  const data = await gasRequest<any>(action, undefined, {
    signal: options?.signal,
  });

  if (!data) throw new Error("Invalid response structure");

  const inflated = await inflatePayload(data);
  idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
  return inflated;
}
export async function ping(options?: GasRequestOptions): Promise<PingResponse> {
  return gasRequest<PingResponse>("ping", undefined, options);
}

export async function getPlayerProfile(
  tag: string,
): Promise<v.InferOutput<typeof ProfileInputSchema>> {
  const profile = await gasRequest<unknown>("getPlayerProfile", { tag });
  return v.parse(ProfileInputSchema, profile);
}

export async function dismissRecruits(
  items: DismissalRequest[],
): Promise<ApiResponse<DismissResponse>> {
  return gasRequest<ApiResponse<DismissResponse>>("dismissRecruits", { 
    // COMPATIBILITY: We send both the new 'items' list (score-aware)
    // and the legacy 'ids' list (tags only) to ensure we don't break
    // if the backend is on a versioned deployment that hasn't updated yet.
    items,
    ids: items.map(i => i.id)
  });
}

export async function undismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  return gasRequest<ApiResponse<DismissResponse>>("undismissRecruits", { ids });
}

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
  } catch (e) {
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