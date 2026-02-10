import { ref, readonly } from "vue";
import { isConfigured, ping, getApiUrl } from "@core";
import type { PingResponse } from "@core/types";

export type ApiStatus =
  | "checking"
  | "online"
  | "offline"
  | "unconfigured"
  | "stale"
  | "waking";

// Global Shared State
const apiUrl = ref("");
const apiConfigured = ref(false);
const apiStatus = ref<ApiStatus>("checking");
const pingData = ref<PingResponse | null>(null);

let isInitialized = false;
let consecutiveFailures = 0; // Track consecutive failures for soft-fail
let handshakeController: AbortController | null = null;

async function checkApiStatus() {
  // Only show "checking" on the very first cold start to avoid flickering during retries
  if (!isInitialized && consecutiveFailures === 0) {
    apiStatus.value = "checking";
  }

  apiConfigured.value = isConfigured();
  apiUrl.value = getApiUrl();

  if (!apiConfigured.value) {
    apiStatus.value = "unconfigured";
    isInitialized = true; 
    return;
  }

  // 🛡️ CANCELLATION: Kill any pending handshake before starting a new one
  if (handshakeController) {
    handshakeController.abort("Replaced by new check");
  }
  handshakeController = new AbortController();
  const signal = handshakeController.signal;

  try {
    if (consecutiveFailures > 0) {
      apiStatus.value = "waking";
    }

    const start = Date.now();

    // ⚡ PATIENT HANDSHAKE: Pass the signal through to the ping call
    const response = await Promise.race([
      ping({ signal }),
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new DOMException("Handshake Timeout", "AbortError")), 25000),
      ),
    ]);
    const latency = Date.now() - start;

    if (response && response.status === "online") {
      apiStatus.value = "online";
      pingData.value = {
        ...response,
        latency,
      };
      consecutiveFailures = 0;
      isInitialized = true;
    } else {
      handleFailure(signal);
    }
  } catch (e: any) {
    if (e.name === "AbortError" && signal.aborted) {
       // Gracefully handle deliberate aborts
       return;
    }
    console.warn("API Handshake Failed:", e);
    handleFailure(signal);
  } finally {
    if (handshakeController?.signal === signal) {
      handshakeController = null;
    }
  }
}

function handleFailure(signal?: AbortSignal) {
  if (signal?.aborted) return;
  consecutiveFailures++;

  // 🛡️ SOFT FAIL ARCHITECTURE
  if (!navigator.onLine) {
    apiStatus.value = "offline";
    isInitialized = true; // Stop active retries if physically offline
    return;
  }

  // Increased tolerance: only hard fail after 5 tries (approx 45s with backoff)
  if (consecutiveFailures >= 5) {
    apiStatus.value = "offline";
    isInitialized = true; 
  } else {
    // Keep checking with progressive backoff (2s, 4s...)
    apiStatus.value = "stale";
    const delay = Math.min(consecutiveFailures * 2000, 10000);
    setTimeout(checkApiStatus, delay);
  }
}

/**
 * 📡 USE API STATE
 * Centralized singleton state for backend connectivity and configuration.
 */
export function useApiState() {
  function init() {
    if (!isInitialized) {
      checkApiStatus();
      isInitialized = true;
    }
  }

  return {
    apiUrl: readonly(apiUrl),
    apiConfigured: readonly(apiConfigured),
    apiStatus: readonly(apiStatus),
    pingData: readonly(pingData),
    checkApiStatus,
    init,
  };
}

// Test Helper
export function resetApiState() {
  if (import.meta.env.TEST) {
    isInitialized = false;
    consecutiveFailures = 0;
    apiStatus.value = "checking";
    pingData.value = null;
  }
}