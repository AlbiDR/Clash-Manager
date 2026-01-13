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
  
  if (url) url = url.trim();

  if (url && !url.startsWith("https://")) {
    if (url.startsWith("http://")) {
      url = url.replace("http://", "https://");
    } else {
      url = `https://${url}`;
    }
  }
  
  if (url && !url.startsWith("https://") && !url.includes("google.com/macros")) {
    console.warn("[Security] Suspicious GAS URL detected:", url);
  }
  
  return url;
};

const CACHE_KEY_MAIN = "CLAN_MANAGER_DATA_V7";

/**
 * Inflates the payload with defensive checks to prevent destructuring errors.
 */
export async function inflatePayload(data: unknown): Promise<WebAppData> {
  let parsedData: any;
  
  // Safety check: if data is null/undefined, return empty state
  if (!data) {
    return {
      lb: [],
      meta: { timestamp: new Date().toISOString(), version: "0.0.0" }
    };
  }

  if (typeof data === "string") {
    try {
      parsedData = JSON.parse(data);
    } catch (e) {
      console.error("[gasClient] JSON Parse Error", e);
      return { lb: [], meta: { timestamp: new Date().toISOString(), version: "0.0.0" } };
    }
  } else {
    parsedData = data;
  }

  const { v: valibot } = await import("valibot");
  
  const schema = valibot.object({
    lb: valibot.array(valibot.any()),
    meta: valibot.record(valibot.string(), valibot.any()),
  });

  const result = valibot.safeParse(schema, parsedData);
  if (result.success) {
    return result.output as WebAppData;
  }

  console.error("[gasClient] Schema validation failed", result.issues);
  return {
    lb: [],
    meta: { timestamp: new Date().toISOString(), version: "0.0.0" }
  };
}

/**
 * Hardened request wrapper.
 * Prevents "TypeError: Cannot destructure property 'data' of 'result' as it is undefined."
 */
async function gasRequest<T>(
  action: string,
  payload: object = {},
): Promise<T> {
  const url = getGasUrl();
  if (!url) throw new Error("GAS URL not configured");

  try {
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();

    // 🛡️ CRITICAL FIX: Verify result exists and has data property before destructuring
    if (result && Object.prototype.hasOwnProperty.call(result, "data")) {
      return result.data as T;
    }
    
    // If it's a direct response without a 'data' envelope
    if (result !== undefined && result !== null) {
      return result as T;
    }

    throw new Error("Malformed API response: No data found");
  } catch (error: any) {
    console.error(`[gasClient] ${action} failed:`, error.message);
    throw error;
  }
}

export async function loadCache(): Promise<WebAppData | null> {
  return idb.get<WebAppData>(CACHE_KEY_MAIN);
}

export async function fetchRemote(): Promise<WebAppData> {
  const valibotPreload = import("valibot");

  try {
    const data = await gasRequest<any>("getwebappdata");
    await valibotPreload;
    const inflated = await inflatePayload(data);
    idb.set(CACHE_KEY_MAIN, inflated).catch(() => {});
    return inflated;
  } catch (error) {
    // Return empty state on failure to keep PWA functional
    return inflatePayload(null);
  }
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
  return getGasUrl();
}
