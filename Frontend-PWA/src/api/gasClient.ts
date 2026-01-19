/**
 * GAS API Client
 * Optimized for reliability, test passing, and backward compatibility.
 */

import type {
  ApiResponse,
  WebAppData,
  PingResponse,
  DismissResponse,
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

/**
 * Inflates the payload.
 * ⚡ ROBUSTNESS UPDATE: Handles Schema-Driven parsing with Fallbacks and Legacy Keys.
 */
export async function inflatePayload(data: unknown): Promise<WebAppData> {
  let parsedData: any;
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

  if (parsedData.format !== "matrix") {
    return parsedData as WebAppData;
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
  const source = check.success ? check.output : (parsedData as any);

  const lbMatrix = Array.isArray(source.lb) ? source.lb : [];
  const hhMatrix = Array.isArray(source.hh) ? source.hh : [];
  
  // 🛡️ SCHEMA FALLBACK: Use provided schema or default to standard V10 structure
  let lbSchema = source.schema?.lb;
  let hhSchema = source.schema?.hh;

  if (!lbSchema || !Array.isArray(lbSchema) || lbSchema.length === 0) {
    lbSchema = DEFAULT_LB_SCHEMA;
  }
  
  if (!hhSchema || !Array.isArray(hhSchema) || hhSchema.length === 0) {
    hhSchema = DEFAULT_HH_SCHEMA;
  }

  const safeStr = (v: any) => (v === null || v === undefined ? "" : String(v));
  const safeNum = (v: any) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/,/g, "").replace(/%/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  /**
   * Universal Mapper
   * Relies on the schema keys provided by the backend, with legacy compat support.
   */
  const mapRow = (row: any[], schema: string[], type: "lb" | "hh") => {
    if (!row || !Array.isArray(row)) return null;

    // Create a key-to-value map for this row based on schema
    const d: Record<string, any> = {};
    schema.forEach((key, index) => {
      if (index < row.length) d[key] = row[index];
    });

    if (type === "lb") {
      // 🛡️ LEGACY COMPAT: Map 's' -> performanceScore, 'r' -> performanceRawScore
      const perfScore = d.performanceScore ?? d.s;
      const perfRaw = d.performanceRawScore ?? d.r; // Handle old 'r' key

      return {
        id: safeStr(d.id),
        n: safeStr(d.n),
        t: safeNum(d.t),
        performanceScore: safeNum(perfScore), 
        performanceRawScore: safeNum(perfRaw),
        dt: safeNum(d.dt),
        d: {
          role: safeStr(d.role),
          days: safeNum(d.days),
          avg: safeNum(d.avg),
          seen: safeStr(d.seen || "-"),
          rate: safeStr(d.rate || "0%"),
          wfame: safeNum(d.wfame),
          hist: safeStr(d.hist),
        },
      };
    } else {
      return {
        id: safeStr(d.id),
        n: safeStr(d.n),
        t: safeNum(d.t),
        potentialScore: safeNum(d.potentialScore),
        potentialRawScore: safeNum(d.potentialRawScore),
        d: {
          don: safeNum(d.don),
          war: safeNum(d.war),
          ago: safeStr(d.ago),
          cards: safeNum(d.cards),
        },
      };
    }
  };

  return {
    lb: lbMatrix
      .map((r: any) => mapRow(r, lbSchema, "lb"))
      .filter(Boolean) as any[],
    hh: hhMatrix
      .map((r: any) => mapRow(r, hhSchema, "hh"))
      .filter(Boolean) as any[],
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

async function enqueueOfflineRequest(request: any) {
  const queue = (await idb.get<any[]>("offline_queue")) || [];
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
  const data = await gasRequest<any>(action, undefined, {
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

export function isConfigured(): boolean {
  return Boolean(getGasUrl());
}

export function getApiUrl(): string {
  return getGasUrl() || "(not configured)";
}
