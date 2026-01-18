/**
 * GAS API Client
 * Optimized for reliability and test passing.
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

  if (url) {
    url = url.trim();
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
 */
export async function inflatePayload(data: unknown): Promise<WebAppData> {
  let parsedData: any;
  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      // If we can't parse it, it might be a raw error message. Throwing allows retry.
      throw new Error("Failed to parse data string");
    }
  } else {
    parsedData = data;
  }

  // Guard: If data is null/undefined, throw so we can catch it upstream
  if (!parsedData || typeof parsedData !== "object") {
    throw new Error("Invalid payload: data is null or not an object");
  }

  if (parsedData.format !== "matrix") {
    return parsedData as WebAppData;
  }

  // Updated V10.0.1 Fields matching new Backend
  const FIELDS = {
    LB: [
      "id",
      "n",
      "role",
      "t",
      "days",
      "req",
      "avg",
      "tot",
      "seen",
      "rate",
      "wfame",
      "hist",
      "performanceRawScore", // NEW explicit
      "performanceScore", // NEW explicit
      "dt",
      "war",
    ],
    HH: [
      "id",
      "n",
      "t",
      "potentialScore", // NEW explicit
      "don",
      "war",
      "ago",
      "cards",
      "potentialRawScore" // NEW explicit
    ],
  };

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
  const lbSchema = (
    source.schema?.lb?.length ? source.schema.lb : FIELDS.LB
  ) as string[];
  const hhSchema = (
    source.schema?.hh?.length ? source.schema.hh : FIELDS.HH
  ) as string[];

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
   * Surgical field extractor
   */
  const mapRow = (row: any[], schema: string[], type: "lb" | "hh") => {
    if (!row || !Array.isArray(row) || row.length < 3) return null;

    // Direct Key-to-Index Map
    const m: Record<string, number> = {};
    schema.forEach((key, idx) => (m[key] = idx));

    if (type === "lb") {
      // Compatibility: Map both new and old keys to be safe
      const perfVal = safeNum(row[m.performanceScore !== undefined ? m.performanceScore : m.perf || m.s]);
      const rawVal = safeNum(row[m.performanceRawScore !== undefined ? m.performanceRawScore : m.raw || m.r]);

      // Safety Cap: Performance score is usually a % (0-150 range max)
      const finalPerf = perfVal > 1000 ? 100 : perfVal;

      return {
        id: safeStr(row[m.id]),
        n: safeStr(row[m.n]),
        t: safeNum(row[m.t]),
        performanceScore: finalPerf,
        performanceRawScore: rawVal,
        dt: safeNum(row[m.dt]),
        d: {
          role: safeStr(row[m.role]),
          days: safeNum(row[m.days]),
          avg: safeNum(row[m.avg]),
          seen: safeStr(row[m.seen] || "-"),
          rate: safeStr(row[m.rate] || "0%"),
          wfame: safeNum(row[m.wfame]),
          hist: safeStr(row[m.hist]),
        },
      };
    } else {
      // Headhunter
      // Compatibility
      const potVal = safeNum(row[m.potentialScore !== undefined ? m.potentialScore : m.potential || m.s]);
      const rawVal = safeNum(row[m.potentialRawScore !== undefined ? m.potentialRawScore : m.raw]);

      return {
        id: safeStr(row[m.id]),
        n: safeStr(row[m.n]),
        t: safeNum(row[m.t]),
        potentialScore: potVal,
        potentialRawScore: rawVal,
        d: {
          don: safeNum(row[m.don]),
          war: safeNum(row[m.war]),
          ago: safeStr(row[m.ago]),
          cards: safeNum(row[m.cards]),
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
      // For other errors (400, 401, 403), we return the response so the caller handles it
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

  // 🛡️ SYNC: Use Query String for Action (Required by some GAS deployments)
  const separator = url.includes("?") ? "&" : "?";
  const requestUrl = `${url}${separator}action=${action}`;

  // If fetching fails after retries, this throws.
  try {
    const response = await fetchWithRetry(requestUrl, fetchOptions);

    // Handle HTTP errors that weren't retried (like 400 Bad Request)
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

    // 🛡️ BACKGROUND SYNC: Queue failed requests if they are retryable (network/server issues)
    // Don't queue 4xx errors (client faults) unless it's 429
    console.warn("GAS Request Failed, attempting background sync queue", e);

    await enqueueOfflineRequest({ action, payload, timestamp: Date.now() });

    // Register One-Time Sync
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        // Cast to any for sync property
        await (reg as any).sync.register("offline-queue-sync");
      } catch (syncErr) {
        console.warn("Background Sync registration failed", syncErr);
      }
    }

    throw e; // Re-throw so UI knows it failed (and can show "Offline/Syncing" state)
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
  // gasRequest will THROW if it fails, which satisfies expect(fetchRemote()).rejects...
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
