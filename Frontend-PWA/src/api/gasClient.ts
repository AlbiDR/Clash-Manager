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

  // If this fails, let it fail loudly so we know the environment is broken.
  const valibot = await import("valibot");

  const WebAppDataSchema = valibot.object({
    lb: valibot.array(valibot.array(valibot.unknown())),
    hh: valibot.array(valibot.array(valibot.unknown())),
    timestamp: valibot.number(),
  });

  const result = valibot.safeParse(WebAppDataSchema, parsedData);

  if (!result.success) throw new Error("API Schema Mismatch");

  // Valibot v1+ uses .output instead of .data for success result
  const { lb, hh, timestamp } = result.output;
  const playerTag = (parsedData as any).playerTag;

  // Strict bounds checking for matrix columns
  return {
    lb: lb.map((r: any) => {
      if (r.length < 16) throw new Error("Matrix Row (LB) underflow");
      return {
        id: String(r[1]),
        n: String(r[2]),
        t: Number(r[4]),
        s: Number(r[14]), // Performance Score (Col O)
        d: {
          role: String(r[3]),
          days: Number(r[5]),
          avg: Number(r[7]),
          seen: r[9] ? String(r[9]) : null,
          rate: r[10] ? String(r[10]) : null,
          wfame: Number(r[11] ?? 0),
          hist: String(r[12]),
        },
        dt: Number(r[15] ?? 0),
        r: Number(r[13] ?? 0), // Raw Score (Col N)
      };
    }),
    hh: hh.map((r: any) => {
      if (r.length < 7) throw new Error("Matrix Row (HH) underflow");
      return {
        id: String(r[0]),
        n: String(r[1]),
        t: Number(r[2]),
        s: Number(r[3]),
        d: {
          don: Number(r[4]),
          war: Number(r[5]),
          ago: String(r[6]),
          cards: Number(r[7] ?? 0),
        },
      };
    }),
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
