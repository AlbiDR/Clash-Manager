import { ref, readonly } from "vue";
import { isConfigured, ping, getApiUrl } from "../api/gasClient";
import type { PingResponse } from "../types";

export type ApiStatus =
  | "checking"
  | "online"
  | "offline"
  | "unconfigured"
  | "stale";

// Global Shared State
const apiUrl = ref("");
const apiConfigured = ref(false);
const apiStatus = ref<ApiStatus>("checking");
const pingData = ref<PingResponse | null>(null);

let isInitialized = false;
let retryAttempted = false; // State Recovery Retry State
let consecutiveFailures = 0; // Track consecutive failures for soft-fail

async function checkApiStatus() {
  if (!isInitialized) apiStatus.value = "checking";

  apiConfigured.value = isConfigured();
  apiUrl.value = getApiUrl();

  if (!apiConfigured.value) {
    apiStatus.value = "unconfigured";
    return;
  }

  try {
    const start = Date.now();

    // Ping Timeout (5s)
    const response = await Promise.race([
      ping(),
      new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error("Ping Timeout")), 5000),
      ),
    ]);
    const latency = Date.now() - start;

    if (response && response.status === "online") {
      apiStatus.value = "online";
      pingData.value = {
        ...response,
        latency,
      };
      // Reset failure counters on success
      consecutiveFailures = 0;
      retryAttempted = false;
    } else {
      handleFailure();
    }
  } catch (e) {
    console.warn("API Status Check Failed:", e);
    handleFailure();
  }
}

function handleFailure() {
  consecutiveFailures++;

  // Soft Fail: If it's the first failure, keep previous status (or set to stale)
  // Only invalidating if specific threshold reached
  if (consecutiveFailures >= 2 || !navigator.onLine) {
    apiStatus.value = "offline";
  } else {
    // If we were online, strictly stay online or switch to 'stale' if you prefer
    // ensuring we don't flash red immediately.
    // Keeping it "online" for one blip is usually better for UX.
    if (apiStatus.value !== "checking") {
      apiStatus.value = "stale";
    }
  }

  // State Recovery (Auto-retry once)
  if (!retryAttempted) {
    retryAttempted = true;
    setTimeout(checkApiStatus, 500); // Fast retry
  } else if (consecutiveFailures < 3) {
    // Allow a second retry with longer backoff
    setTimeout(checkApiStatus, 2000);
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
    retryAttempted = false;
    consecutiveFailures = 0;
    apiStatus.value = "checking";
    pingData.value = null;
  }
}
