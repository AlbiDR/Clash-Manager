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
const pendingRequests = new Map<string, Promise<any>>();

// Default Schemas for fallback (matches V11 Controller Standard)
const DEFAULT_LB_SCHEMA = [
  "id", "n", "role", "t", "performanceScore", "performanceRawScore", 
  "days", "req", "avg", "tot", "seen", "rate", "wfame", 
  "hist", "dt", "war"
];

const DEFAULT_HH_SCHEMA = [
  "id", "n", "t", "potentialScore", "potentialRawScore", "don", 
  "war", "cards", "ago"
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

  if (!url) return "";
  
  url = url.trim();

  // ⚡ SMART RESOLUTION: Handle raw Deployment IDs (format: AKfycb...)
  if (!url.includes("/") && !url.includes(".") && url.length > 20) {
     return `https://script.google.com/macros/s/${url}/exec`;
  }

  // 🛡️ SYNC: Ensure SW can see the URL via IDB
  idb.set("cm_gas_url", url).catch(() => {});

  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    url = `https://${url}`;
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

  const mapRow = (row: any[], schema: string[], type: "lb" | "hh") => {
    if (!row || !Array.isArray(row)) return null;

    const d: Record<string, any> = {};
    schema.forEach((key, index) => {
      if (index < row.length) d[key] = row[index];
    });

    if (type === "lb") {
      const perfScore = d.performanceScore ?? d.s;
      const perfRaw = d.performanceRawScore ?? d.r;

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
      cache: "no-store", // 🛡️ RELIABILITY: Prevent stale redirects or "Blocked" responses
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
    
    // 🛡️ RECOGNITION: Correctly identify if the error was a deliberate abort vs timeout
    if (e.name === "AbortError") {
      throw e; 
    }

    if (retries > 0) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
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

  // ⚡ MANDATORY: GAS requires 'action' in the URL for proper routing and redirects.
  // Cache busting is also essential to prevent the browser from skipping the redirect.
  const separator = url.includes("?") ? "&" : "?";
  const cacheBuster = `_cb=${Date.now()}`;
  const requestUrl = `${url}${separator}action=${action}&${cacheBuster}`;

  try {
    const response = await fetchWithRetry(requestUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      throw new Error("Empty Response from Server");
    }

    // 🛡️ ROBUST ERROR DETECTION: 
    // GAS returns HTML (starting with <) when auth fails or script crashes completely.
    // This is the most common cause of "Load Failed" loops.
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
    if (e.name === "AbortError") throw e;
    
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
    
    if (json.candidates && Array.isArray(json.candidates)) {
      return json.candidates.map((c: any) => ({
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
        }
      }));
    }
    return null;
  } catch (e) {
    return null;
  }
}

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

export function isConfigured(): boolean {
  return Boolean(getGasUrl());
}

export function getApiUrl(): string {
  return getGasUrl() || "(not configured)";
}

export function isWorkerConfigured(): boolean {
  return Boolean(getWorkerUrl());
}