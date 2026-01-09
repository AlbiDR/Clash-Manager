/**
 * GAS API Client
 */

import type {
  ApiResponse,
  WebAppData,
  PingResponse,
  DismissResponse,
} from "../types";
import { idb } from "../utils/idb";

const getGasUrl = () => {
  let url = "";
  if (typeof localStorage !== "undefined") {
    url = localStorage.getItem("cm_gas_url") || import.meta.env.VITE_GAS_URL || "";
  } else {
    url = import.meta.env.VITE_GAS_URL || "";
  }
  
  // Fix 24: Url Sanitization
  if (url) url = url.trim();

  // Fix 25: Protocol Enforcement
  if (url && !url.startsWith("https://")) {
    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    } else {
      url = `https://${url}`;
    }
  }
  
  // 🛡️ SECURITY: Basic format validation to prevent injection or malformed requests
  if (url && !url.startsWith("https://") && !url.includes("google.com/macros")) {
    console.warn("[Security] Suspicious GAS URL detected:", url);
    // Optionally return empty or throw if strictness is required
  }
  
  return url;
};


// Fix 8: Cache Versioning
const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

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

  // ⚡ OPTIMIZATION: Only load Zod for validation on full remote syncs, not hydration
  // Fix 6: Zod Import Retry
  let z: any;
  try {
     const mod = await import("zod");
     z = mod.z;
  } catch(e) {
     console.warn("Zod load failed, retrying...");
     await new Promise(r => setTimeout(r, 200));
     const mod = await import("zod");
     z = mod.z;
  }

  const result = z
    .object({
      lb: z.array(z.array(z.unknown())),
      hh: z.array(z.array(z.unknown())),
      timestamp: z.number(),
    })
    .safeParse(parsedData);

  if (!result.success) throw new Error("API Schema Mismatch");

  const { lb, hh, timestamp } = result.data;

  // Strict bounds checking for matrix columns
  return {
    lb: lb.map((r) => {
      if (r.length < 10) throw new Error("Matrix Row (LB) underflow");
      return {
        id: String(r[0]),
        n: String(r[1]),
        t: Number(r[2]),
        s: Number(r[3]),
        d: {
          role: String(r[4]),
          days: Number(r[5]),
          avg: Number(r[6]),
          seen: r[7] ? String(r[7]) : null,
          rate: r[8] ? String(r[8]) : null,
          hist: String(r[9]),
        },
        dt: Number(r[10] ?? 0),
        r: Number(r[11] ?? 0),
      };
    }),
    hh: hh.map((r) => {
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
    timestamp,
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 500,
): Promise<Response> {
  // 🛡️ Resilience: Avoid immediate failure if offline (Resilience #62)
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    console.warn("[Network] Device is offline. Waiting for connectivity...");
    try {
      await new Promise((resolve, reject) => {
        let onOnline: () => void;
        
        const timeout = setTimeout(() => {
          window.removeEventListener("online", onOnline); // Fix 9: Listener Cleanup
          reject(new Error("Network offline: Timeout waiting for connectivity"));
        }, 10000); // 10s wait for online

        onOnline = () => {
          clearTimeout(timeout);
          resolve(true);
        };
        
        window.addEventListener("online", onOnline, { once: true });
      });
    } catch (e) {
      throw e;
    }
  }

  try {
    // 🛡️ Resilience: Add timeout to fetch requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s request timeout
    const fetchOptions = {
      ...options,
      signal: options.signal || controller.signal,
    };

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok && retries > 0 && response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } catch (e) {
    const isNetworkError =
      e instanceof TypeError ||
      (e instanceof Error && e.name === "TypeError") ||
      (e instanceof Error && e.name === "AbortError"); // Treat timeout as network error for retry

    if (retries > 0) {
      console.warn(
        `Fetch failed (Network: ${isNetworkError}), retrying (${retries} left)...`,
      );
      // Fix 12: Jitter in Exponential Backoff
  const jitter = Math.random() * 200; 
  const nextBackoff = (backoff * 2) + jitter;
  
  await new Promise((r) => setTimeout(r, backoff));
  return fetchWithRetry(url, options, retries - 1, nextBackoff);
    }
    throw e;
  }
}


type GenericEnvelope<T> = ApiResponse<T> & { success?: boolean; status?: string; message?: string };

async function gasRequest<T>(
  action: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const url = getGasUrl();
  if (!url) throw new Error("GAS_URL not configured.");

  const options: RequestInit = {
    method: action === "getwebappdata" ? "GET" : "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain" },
    body:
      action === "getwebappdata"
        ? undefined
        : JSON.stringify({ action, ...payload }),
  };

  const response = await fetchWithRetry(`${url}?action=${action}`, options);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();

  // Fix 16: Empty Response Handling
  if (!text || !text.trim()) {
    throw new Error("Empty Response from Server");
  }

  let envelope: GenericEnvelope<T>;
  try {
    envelope = JSON.parse(text);
  } catch (e) {
// Fix 14: HTML Detection (Enhanced)
    const lowerText = text.trim().toLowerCase();
    if (
      lowerText.startsWith("<html") ||
      lowerText.includes("<!doctype html>") ||
      lowerText.includes("google accounts")
    ) {
      throw new Error(
        "Google Server Error (Received HTML instead of JSON). Try again later.",
      );
    }
    throw new Error(`Invalid JSON Response: ${text.substring(0, 50)}...`);
  }

// Fix 13: Status Check (Case Insensitive)
  const isSuccess = 
    envelope.success === true || 
    (envelope.status && envelope.status.toLowerCase() === "success") || 
    (envelope.data && !envelope.error);

  if (isSuccess) {
    // Return data part if wrapped, otherwise the whole thing
    return (envelope.data !== undefined ? envelope.data : envelope) as T;
  }
  
  const errorMessage = envelope.error?.message || envelope.message || "Unknown Backend Error";
  throw new Error(errorMessage);
}



export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

export async function fetchRemote(): Promise<WebAppData> {
  // ⚡ PERFORMANCE: Start Zod library download in parallel with Network Request.
  const zodPreload = import("zod");

  // gasRequest already unwraps the { data: ... } envelope if it exists
  const data = await gasRequest<any>("getwebappdata");
  
  if (!data) throw new Error("Invalid response structure: No data returned");

  // Ensure Zod is fully loaded before attempting inflation
  await zodPreload;

  const inflated = await inflatePayload(data);
  idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
  return inflated;
}

export async function ping(): Promise<ApiResponse<PingResponse>> {
  return gasRequest<ApiResponse<PingResponse>>("ping");
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
