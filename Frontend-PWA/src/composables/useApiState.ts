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
    const response = await ping();
    const latency = Date.now() - start;

    if (response.success && response.data) {
      apiStatus.value = "online";
      pingData.value = {
        ...response.data,
        latency,
      };
    } else {
      apiStatus.value = "offline";
    }
  } catch (e) {
    console.error("API Status Check Failed:", e);
    apiStatus.value = "offline";
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

