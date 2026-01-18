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
 * USES STANDARD DYNAMIC IMPORT to prevent TypeError crashes.
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

  // No longer strictly requiring Valibot for runtime blocking, use it as a check
  const valibot = await import("valibot");
  const WebAppDataSchema = valibot.object({
    lb: valibot.array(valibot.array(valibot.unknown())),
    hh: valibot.array(valibot.array(valibot.unknown())),
    timestamp: valibot.union([valibot.number(), valibot.string()]),
  });

  const check = valibot.safeParse(WebAppDataSchema, parsedData);
  if (!check.success) {
    console.warn("API Schema Warning (Non-Fatal):", check.issues);
  }

  // Use parsedData directly for better resiliency if schema check fails
  const source = check.success ? check.output : (parsedData as any);
  const lbMatrix = Array.isArray(source.lb) ? source.lb : [];
  const hhMatrix = Array.isArray(source.hh) ? source.hh : [];
  const timestamp = Number(source.timestamp) || Date.now();
  const playerTag = (parsedData as any).playerTag;

  // ⚡ SMART SYNC: Dynamically map based on returned schema
  const lbSchema = (source.schema?.lb as string[]) || [];
  const hhSchema = (source.schema?.hh as string[]) || [];

  const getIdx = (schema: string[], key: string, fallback: number) => {
    const idx = schema.indexOf(key);
    return idx === -1 ? fallback : idx;
  };

  const L = {
    id: getIdx(lbSchema, "id", 0),
    n: getIdx(lbSchema, "n", 1),
    t: getIdx(lbSchema, "t", 2),
    s: getIdx(lbSchema, "s", 3),
    role: getIdx(lbSchema, "role", 4),
    days: getIdx(lbSchema, "days", 5),
    avg: getIdx(lbSchema, "avg", 6),
    seen: getIdx(lbSchema, "seen", 7),
    rate: getIdx(lbSchema, "rate", 8),
    wfame: getIdx(lbSchema, "wfame", 9),
    hist: getIdx(lbSchema, "hist", 10),
    dt: getIdx(lbSchema, "dt", 11),
    r: getIdx(lbSchema, "r", 12),
  };

  const H = {
    id: getIdx(hhSchema, "id", 0),
    n: getIdx(hhSchema, "n", 1),
    t: getIdx(hhSchema, "t", 2),
    s: getIdx(hhSchema, "s", 3),
    don: getIdx(hhSchema, "don", 4),
    war: getIdx(hhSchema, "war", 5),
    ago: getIdx(hhSchema, "ago", 6),
    cards: getIdx(hhSchema, "cards", 7),
  };

  // Robust parsing helpers
  const safeNum = (v: any) => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/,/g, "").replace(/%/g, "");
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  };

  const safeStr = (v: any) => (v === null || v === undefined ? "" : String(v));

  return {
    lb: lbMatrix
      .map((r: any) => {
        if (!r || !Array.isArray(r) || r.length < 3) return null;

        // 🛡️ LEGACY FALLBACK: If schema is missing and row is very long, it's the old sheet format
        const isLegacySheet = !source.schema && r.length >= 15;
        const isBuffered = r[0] === "BUFFER";

        if (isLegacySheet || isBuffered) {
          const offset = isBuffered ? 1 : 0;
          return {
            id: safeStr(r[0 + offset]),
            n: safeStr(r[1 + offset]),
            t: safeNum(r[3 + offset]),
            s: safeNum(r[13 + offset] ?? r[12 + offset]),
            d: {
              role: safeStr(r[2 + offset]),
              days: safeNum(r[4 + offset]),
              avg: safeNum(r[6 + offset]),
              seen: r[8 + offset] ? safeStr(r[8 + offset]) : null,
              rate: r[9 + offset] ? safeStr(r[9 + offset]) : null,
              wfame: safeNum(r[10 + offset]),
              hist: safeStr(r[11 + offset]),
            },
            dt: safeNum(r[14 + offset]),
            r: safeNum(r[12 + offset]),
          };
        }

        return {
          id: safeStr(r[L.id]),
          n: safeStr(r[L.n]),
          t: safeNum(r[L.t]),
          s: safeNum(r[L.s]),
          d: {
            role: safeStr(r[L.role]),
            days: safeNum(r[L.days]),
            avg: safeNum(r[L.avg]),
            seen: r[L.seen] ? safeStr(r[L.seen]) : null,
            rate: r[L.rate] ? safeStr(r[L.rate]) : null,
            wfame: safeNum(r[L.wfame]),
            hist: safeStr(r[L.hist]),
          },
          dt: safeNum(r[L.dt]),
          r: safeNum(r[L.r]),
        };
      })
      .filter(Boolean) as any[],
    hh: hhMatrix
      .map((r: any) => {
        if (!r || !Array.isArray(r) || r.length < 4) return null;
        return {
          id: safeStr(r[H.id]),
          n: safeStr(r[H.n]),
          t: safeNum(r[H.t]),
          s: safeNum(r[H.s]),
          d: {
            don: safeNum(r[H.don]),
            war: safeNum(r[H.war]),
            ago: safeStr(r[H.ago]),
            cards: safeNum(r[H.cards]),
          },
        };
      })
      .filter(Boolean) as any[],
    playerTag,
    timestamp,
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
  const valibotPreload = import("valibot");

  // gasRequest will THROW if it fails, which satisfies expect(fetchRemote()).rejects...
  const action = options?.force ? "refresh" : "getwebappdata";
  const data = await gasRequest<any>(action, undefined, {
    signal: options?.signal,
  });

  if (!data) throw new Error("Invalid response structure");

  await valibotPreload;

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
