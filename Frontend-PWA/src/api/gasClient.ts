/**
 * GAS API Client
 * Optimized for reliability, test passing, and backward compatibility.
 */

import type {
  ApiResponse,
  WebAppData,
  PingResponse,
  DismissResponse,
  Recruit,
} from "../types";
import * as v from "valibot";
import { idb } from "../utils/idb";

const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

// Default Schemas for fallback (matches V10 Standard)
const DEFAULT_LB_SCHEMA = [
  "id", "n", "role", "t", "days", "req", "avg", "tot", 
  "seen", "rate", "wfame", "hist", "performanceRawScore", 
  "performanceScore", "dt", "war"
];

const DEFAULT_HH_SCHEMA = [
  "id", "n", "t", "potentialScore", "don", "war", 
  "ago", "cards", "potentialRawScore"
];

interface GenericEnvelope<T> {
  success?: boolean;
  status?: string;
  data?: T;
  error?: { message: string };
  message?: string;
}

const getGasUrl = () => {
  let url = "";
  if (typeof localStorage !== "undefined") {
    url =
      localStorage.getItem("cm_gas_url") || import.meta.env.VITE_GAS_URL || "";
  } else {
    url = import.meta.env.VITE_GAS_URL || "";
  }

  url = url.trim();

  // ⚡ SMART RESOLUTION: If input looks like a Script ID (no slashes, no dots), construct the URL automatically.
  // Matches standard ID format (alphanumeric, underscores, hyphens)
  if (url && !url.includes("/") && !url.includes(".") && url.length > 15) {
     // Assume it's a raw Deployment ID and construct the Web App URL
     return `https://script.google.com/macros/s/${url}/exec`;
  }

  if (url) {
    // 🛡️ SYNC: Ensure SW can see the URL via IDB
    idb.set("cm_gas_url", url).catch(() => {});
  }

  if (url && !url.startsWith("https://")) {
    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    } else {
      url = `https://${url}`;
    }
  }

  return url;
};

// ⚡ DIRECT WORKER SUPPORT
const getWorkerUrl = () => {
  if (typeof localStorage !== "undefined") {
    const override = localStorage.getItem("cm_worker_url");
    if (override) return override;
  }
  return import.meta.env.VITE_WORKER_URL || "";
};

/**
 * Inflates the payload.
 * ⚡ ROBUSTNESS UPDATE: Handles Schema-Driven parsing with Fallbacks and Legacy Keys.
 */
export async function inflatePayload(data: unknown): Promise<WebAppData> {
  let parsedData: Record<string, unknown>;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      throw new Error("Failed to parse data string");
    }
  } else if (data && typeof data === "object") {
    parsedData = data as Record<string, unknown>;
  } else {
    throw new Error("Invalid payload: data is null or not an object");
  }

  if (parsedData.format !== "matrix") {
    return parsedData as unknown as WebAppData;
  }

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

  const check = v.safeParse(WebAppDataSchema, parsedData);
  if (!check.success) {
    throw new Error("Invalid matrix payload structure");
  }
  const source = check.output;

  const lbMatrix = source.lb || [];
  const hhMatrix = source.hh || [];
  
  // 🛡️ SCHEMA FALLBACK: Use provided schema or default to standard V10 structure
  let lbSchema = source.schema?.lb;
  let hhSchema = source.schema?.hh;

  if (!lbSchema || lbSchema.length === 0) {
    lbSchema = DEFAULT_LB_SCHEMA;
  }
  
  if (!hhSchema || hhSchema.length === 0) {
    hhSchema = DEFAULT_HH_SCHEMA;
  }

  const safeStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const safeNum = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[,%]/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  // Pre-calculate schema indices for O(1) field access
  const getIndices = (schema: string[]) => {
    const indices: Record<string, number> = {};
    schema.forEach((key, i) => {
      indices[key] = i;
    });
    return indices;
  };

  const lbIndices = getIndices(lbSchema);
  const hhIndices = getIndices(hhSchema);

  /**
   * Universal Mapper
   * Relies on the pre-calculated schema indices to avoid O(N*M) lookups.
   */
  const mapRow = (row: unknown[], indices: Record<string, number>, type: "lb" | "hh") => {
    if (!row || !Array.isArray(row)) return null;

    const getVal = (key: string) => {
      const idx = indices[key];
      return idx !== undefined ? row[idx] : undefined;
    };

    if (type === "lb") {
      // 🛡️ LEGACY COMPAT: Map 's' -> performanceScore, 'r' -> performanceRawScore
      const perfScore = getVal("performanceScore") ?? getVal("s");
      const perfRaw = getVal("performanceRawScore") ?? getVal("r");

      return {
        id: safeStr(getVal("id")),
        n: safeStr(getVal("n")),
        t: safeNum(getVal("t")),
        performanceScore: safeNum(perfScore), 
        performanceRawScore: safeNum(perfRaw),
        dt: safeNum(getVal("dt")),
        d: {
          role: safeStr(getVal("role")),
          days: safeNum(getVal("days")),
          avg: safeNum(getVal("avg")),
          seen: safeStr(getVal("seen") || "-"),
          rate: safeStr(getVal("rate") || "0%"),
          wfame: safeNum(getVal("wfame")),
          hist: safeStr(getVal("hist")),
        },
      };
    } else {
      return {
        id: safeStr(getVal("id")),
        n: safeStr(getVal("n")),
        t: safeNum(getVal("t")),
        potentialScore: safeNum(getVal("potentialScore")),
        potentialRawScore: safeNum(getVal("potentialRawScore")),
        d: {
          don: safeNum(getVal("don")),
          war: safeNum(getVal("war")),
          ago: safeStr(getVal("ago")),
          cards: safeNum(getVal("cards")),
        },
      };
    }
  };

  return {
    lb: lbMatrix
      .map((r) => mapRow(r, lbIndices, "lb"))
      .filter((v): v is NonNullable<typeof v> => v !== null),
    hh: hhMatrix
      .map((r) => mapRow(r, hhIndices, "hh"))
      .filter((v): v is NonNullable<typeof v> => v !== null),
    playerTag: source.playerTag,
    timestamp: Number(source.timestamp) || Date.now(),
  };
}

/**
 * Standard Fetch with Retry
 * Throws errors on 4xx/5xx so retries can happen.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 500,
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // We do NOT retry on 4xx (client errors) usually, but 429 (rate limit) is an exception.
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    }
    return response;
  } catch (e: any) {
    if (e.name === "AbortError") throw e; // Don't retry aborts

    if (retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw e;
  }
}

type GasRequestOptions = {
  signal?: AbortSignal;
  force?: boolean;
};

async function gasRequest<T>(
  action: string,
  payload?: Record<string, unknown>,
  options?: GasRequestOptions, // Fix: Add options param
): Promise<T> {
  const url = getGasUrl();
  if (!url) throw new Error("GAS_URL not configured.");

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload }),
    signal: options?.signal, // Fix: Pass signal
  };

  const separator = url.includes("?") ? "&" : "?";
  const requestUrl = `${url}${separator}action=${action}`;

  try {
    const response = await fetchWithRetry(requestUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      throw new Error("Empty Response from Server");
    }

    let envelope: GenericEnvelope<T>;
    try {
      envelope = JSON.parse(text);
    } catch (e) {
      if (text.toLowerCase().includes("<html")) {
        throw new Error("Google Server Error");
      }
      throw new Error("Invalid JSON Response");
    }

    const isSuccess =
      envelope.success === true ||
      (envelope.status && envelope.status.toLowerCase() === "success") ||
      (envelope.data && !envelope.error);

    if (isSuccess) {
      return (envelope.data !== undefined ? envelope.data : envelope) as T;
    }

    const errorMessage =
      envelope.error?.message || envelope.message || "Unknown Backend Error";
    throw new Error(errorMessage);
  } catch (e: any) {
    if (e.name === "AbortError") throw e;

    console.warn("GAS Request Failed, attempting background sync queue", e);

    await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });

    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("offline-queue-sync");
      } catch (syncErr) {
        console.warn("Background Sync registration failed", syncErr);
      }
    }

    throw e; 
  }
}

async function enqueueOfflineRequest(request: { action: string; payload?: Record<string, unknown>; timestamp: number }) {
  const queue = (await idb.get<unknown[]>("offline_queue")) || [];
  queue.push(request);
  await idb.set("offline_queue", queue);
}

export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

export async function fetchRemote(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<WebAppData> {
  const action = options?.force ? "refresh" : "getwebappdata";
  const data = await gasRequest<unknown>(action, undefined, {
    signal: options?.signal,
  });

  if (!data) throw new Error("Invalid response structure");

  const inflated = await inflatePayload(data);
  idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
  return inflated;
}
export async function ping(): Promise<PingResponse> {
  return gasRequest<PingResponse>("ping");
}

export async function dismissRecruits(
  ids: string[],
): Promise<ApiResponse<DismissResponse>> {
  return gasRequest<ApiResponse<DismissResponse>>("dismissRecruits", { ids });
}

export async function triggerBackendUpdate(
  target?: string,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return gasRequest<ApiResponse<{ success: boolean; message: string }>>(
    "triggerUpdate",
    { target },
  );
}

// ⚡ DIRECT WORKER SCAN
export async function scanRecruitsDirect(): Promise<Recruit[] | null> {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) return null;

  try {
    const res = await fetch(`${workerUrl}/public/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: [
          // Basic seed list for public scan if no specific targets
          "2CCCP", "9U9Q9", "29UQQ282", "200000" // Popular tourney patterns or let worker decide
        ],
        // Default scoring profile
        scoring: { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }
      })
    });

    if (!res.ok) throw new Error(`Worker status ${res.status}`);
    const json = await res.json();
    
    // Transform raw worker format to PWA Recruit format
    if (json.candidates && Array.isArray(json.candidates)) {
      return json.candidates.map((c: any) => ({
        id: c.tag.replace("#", ""),
        n: c.name,
        t: c.trophies,
        potentialScore: Math.min(100, Math.round((c.rawScore / 50000) * 100)), // Approx normalization
        potentialRawScore: c.rawScore,
        d: {
          don: c.donations,
          war: c.war,
          cards: c.cards,
          ago: new Date().toISOString()
        }
      }));
    }
    return null;
  } catch (e) {
    console.warn("Direct worker scan failed:", e);
    return null;
  }
}

// 🔔 PUSH SUBSCRIPTION
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
    console.warn("Push subscription failed:", e);
    return false;
  }
}

export function isConfigured(): boolean {
  return Boolean(getGasUrl());
}

export function getApiUrl(): string {
  return getGasUrl() || "(not configured)";
}

export function isWorkerConfigured(): boolean {
  return Boolean(getWorkerUrl());
}
