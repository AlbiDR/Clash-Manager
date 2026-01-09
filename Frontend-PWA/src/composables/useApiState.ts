import { ref, readonly } from "vue";
import { isConfigured, ping, getApiUrl } from "../api/gasClient";
import type { PingResponse } from "../types";

export type ApiStatus = "checking" | "online" | "offline" | "unconfigured";

// Global Shared State
const apiUrl = ref("");
const apiConfigured = ref(false);
const apiStatus = ref<ApiStatus>("checking");
const pingData = ref<PingResponse | null>(null);

let isInitialized = false;
let retryAttempted = false; // Fix 18: State Recovery Retry State

async function checkApiStatus() {
  apiStatus.value = "checking";
  apiConfigured.value = isConfigured();
  apiUrl.value = getApiUrl();

  if (!apiConfigured.value) {
    apiStatus.value = "unconfigured";
    return;
  }

  try {
    const start = Date.now();
    
    // Fix 17: Ping Timeout (5s)
    const response = await Promise.race([
      ping(),
      new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Ping Timeout")), 5000))
    ]);
    const latency = Date.now() - start;

    if (response && response.status === "online") {
      apiStatus.value = "online";
      pingData.value = {
        ...response,
        latency,
      };
    } else {
      apiStatus.value = "offline";
    }
  } catch (e) {
    console.warn("API Status Check Failed:", e);
    apiStatus.value = "offline";

    // Fix 18: State Recovery (Auto-retry once)
    if (!retryAttempted) {
       retryAttempted = true;
       setTimeout(checkApiStatus, 2000);
    }
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

