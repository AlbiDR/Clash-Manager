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
  
  // 🛡️ SECURITY: Basic format validation to prevent injection or malformed requests
  if (url && !url.startsWith("https://") && !url.includes("google.com/macros")) {
    console.warn("[Security] Suspicious GAS URL detected:", url);
    // Optionally return empty or throw if strictness is required
  }
  
  return url;
};


const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V6";

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
  const { z } = await import("zod");

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
    await new Promise((resolve) => {
      window.addEventListener("online", resolve, { once: true });
    });
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } catch (e) {
    const isNetworkError = e instanceof TypeError || (e instanceof Error && e.name === "TypeError");
    
    if (retries > 0) {
      console.warn(`Fetch failed (Network: ${isNetworkError}), retrying (${retries} left)...`);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
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

  let envelope: GenericEnvelope<T>;
  try {
    envelope = JSON.parse(text);
  } catch (e) {
    if (
      text.trim().toLowerCase().startsWith("<html") ||
      text.includes("<!DOCTYPE html>")
    ) {
      throw new Error(
        "Google Server Error (Received HTML instead of JSON). Try again later.",
      );
    }
    throw new Error(`Invalid JSON Response: ${text.substring(0, 50)}...`);
  }

  // Robust status check across multiple GAS response versions
  const isSuccess = 
    envelope.success === true || 
    envelope.status === "success" || 
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
  // This eliminates the waterfall effect where Zod is requested only after the JSON payload arrives.
  // The previous critical chain audit showed v-zod blocked for ~4.2s.
  const zodPreload = import("zod");

  const envelope = await gasRequest<ApiResponse<Record<string, unknown>>>("getwebappdata");
  if (!envelope.data) throw new Error("Invalid response structure");

  // Ensure Zod is fully loaded before attempting inflation
  await zodPreload;

  const inflated = await inflatePayload(envelope.data);
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
