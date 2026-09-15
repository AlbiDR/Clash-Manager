// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getApiUrl, isConfigured, ping } from "./SupabaseClient";
import { ref, readonly } from "vue";
import type { PingResponse } from "@core/types";

/**
 * L1 Core: API State Service
 *
 * @remarks
 * This service acts as a kernel-level hardware broker for the network API,
 * managing the global lifecycle of the backend connection. It centralizes
 * configuration discovery, connectivity handshakes, and failure recovery
 * to provide a unified view of system health across the application.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * Represents the connectivity state of the backend API.
 */
export type ApiStatus =
  | "checking"
  | "online"
  | "offline"
  | "unconfigured"
  | "stale"
  | "waking";



// Global Shared State (Kernel Singletons)
const apiUrl = ref("");
const apiConfigured = ref(false);
const apiStatus = ref<ApiStatus>("checking");
const pingData = ref<PingResponse | null>(null);



let isInitialized = false;
let consecutiveFailures = 0; // Track consecutive failures for soft-fail
let handshakeController: AbortController | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let connectivityListenersRegistered = false;

const HANDSHAKE_TIMEOUT_MS = 25000;

function clearRetryTimer() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function handleBrowserOffline() {
  clearRetryTimer();
  handshakeController?.abort("Browser went offline");
  apiStatus.value = "offline";
  isInitialized = true;
}

function handleBrowserOnline() {
  void checkApiStatus();
}

function registerConnectivityRecovery() {
  if (connectivityListenersRegistered || typeof window === "undefined") return;

  window.addEventListener("offline", handleBrowserOffline);
  window.addEventListener("online", handleBrowserOnline);
  connectivityListenersRegistered = true;
}

/**
 * Internal logic for checking API availability.
 * Handles configuration discovery, ping handshakes, and failure recovery.
 */
async function checkApiStatus() {
  // An explicit check supersedes any delayed retry. Without this cancellation,
  // focus, polling, and browser-online recovery could each leave a timer behind
  // and repeatedly replace one another's handshakes.
  clearRetryTimer();

  // [DECISION LOG] FLICKER MITIGATION
  // Rationale: Only show "checking" on the very first cold start to avoid UI
  // instability during background retries or waking transitions.
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

  // [DECISION LOG] HANDSHAKE CANCELLATION
  // Rationale: If a new check is triggered before the previous one completes,
  // we abort the stale request to prevent race conditions and redundant network use.
  if (handshakeController) {
    handshakeController.abort("Replaced by new check");
  }
  handshakeController = new AbortController();
  const signal = handshakeController.signal;
  let handshakeTimedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    // [DECISION LOG] WAKING STATE
    // Rationale: Provides visual feedback that the system is attempting recovery
    // after a failure, distinguishing it from a standard background sync.
    if (consecutiveFailures > 0 || apiStatus.value === "offline") {
      apiStatus.value = "waking";
    }

    const start = Date.now();

    // [DECISION LOG] PATIENT HANDSHAKE
    // Rationale: A 25s timeout accommodates cold starts for Supabase Edge Functions
    // (Project Waking) while ensuring the UI eventually hard-fails if unreachable.
    const response = await Promise.race([
      ping({ signal }),
      new Promise<PingResponse>((_, reject) => {
        timeoutId = setTimeout(() => {
          handshakeTimedOut = true;
          if (handshakeController?.signal === signal) {
            handshakeController.abort("Handshake timed out");
          }
          reject(new DOMException("Handshake Timeout", "AbortError"));
        }, HANDSHAKE_TIMEOUT_MS);
      }),
    ]);
    // [DECISION LOG] PERFORMANCE TELEMETRY
    // Rationale: Tracking handshake latency allows the UI to diagnose
    // slow network conditions or backend cold-start penalties.
    const latency = Date.now() - start;

    if (response && response.status === "success") {
      apiStatus.value = "online";
      pingData.value = {
        ...response,
        latency,
      };
      consecutiveFailures = 0;
      isInitialized = true;
    } else {
      handleFailure(handshakeTimedOut ? undefined : signal);
    }
  } catch (handshakeError: unknown) {
    // [DECISION LOG] ABORT RESILIENCE
    // Rationale: AbortErrors triggered by our own cancellation logic are
    // non-fatal and should not trigger the failure recovery path.
    if (handshakeError instanceof Error && handshakeError.name === "AbortError" && signal.aborted && !handshakeTimedOut) {
       return;
    }
    console.warn("API Handshake Failed:", handshakeError);
    handleFailure(handshakeTimedOut ? undefined : signal);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (handshakeController?.signal === signal) {
      handshakeController = null;
    }
  }
}

/**
 * Handles failed connectivity attempts with progressive backoff.
 */
function handleFailure(signal?: AbortSignal) {
  if (signal?.aborted) return;
  consecutiveFailures++;

  // [DECISION LOG] SOFT FAIL ARCHITECTURE
  // Rationale: If physically offline (Browser API), we halt retries immediately
  // to preserve battery and compute, transitioning to a stable 'offline' state.
  if (!navigator.onLine) {
    apiStatus.value = "offline";
    isInitialized = true;
    return;
  }

  // [DECISION LOG] PROGRESSIVE RECOVERY
  // Rationale: Only hard-fail after 5 attempts (~45s cumulative) to allow for
  // transient network hops or Edge Function cold starts. Intermediate failures
  // are marked as 'stale' with an exponential backoff.
  if (consecutiveFailures >= 5) {
    apiStatus.value = "offline";
    isInitialized = true; 
  } else {
    // [THREAT:] RETRY STORM
    // Rationale: Exponential backoff (2s, 4s, 6s, 8s capped at 10s) prevents
    // slamming the backend or API proxy during an outage.
    apiStatus.value = "stale";
    const delay = Math.min(consecutiveFailures * 2000, 10000);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void checkApiStatus();
    }, delay);
  }
}

/**
 * Centralized singleton state for backend connectivity and configuration.
 *
 * @remarks
 * This composable acts as a kernel-level hardware broker for the network API.
 * It manages global singleton state (ref) to ensure all components share
 * a unified view of backend health without redundant handshake calls.
 *
 * @returns An object containing:
 * - Reactive State:
 *   - `apiUrl`: Readonly reference to the current Supabase endpoint.
 *   - `apiConfigured`: Boolean indicating if a valid URL exists in Substrate.
 *   - `apiStatus`: Current lifecycle state of the connection (e.g., 'online', 'waking').
 *   - `pingData`: Detailed metadata from the last successful handshake (version, latency).
 * - Side Effects:
 *   - `checkApiStatus`: Triggers an immediate network handshake with cancellation support.
 *   - `init`: Bootstraps the singleton state on application start.
 *
 * @sideeffects
 * - Initiates network fetch calls to the Supabase backend via `ping`.
 * - Manages an `AbortController` for request lifecycle governance.
 * - Schedules recursive retries using `setTimeout` on failure.
 */
export function useApiState() {
  function init() {
    registerConnectivityRecovery();
    if (!isInitialized) {
      void checkApiStatus();
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

/**
 * [TEST HELPER] Resets internal module state.
 *
 * @remarks
 * Rationale: Ensures that singleton state does not leak between unit tests,
 * enabling deterministic verification of boot and recovery logic.
 * Only active in Vitest environments.
 */
export function resetApiState() {
  if (import.meta.env.TEST) {
    clearRetryTimer();
    handshakeController?.abort("Test state reset");
    handshakeController = null;
    if (connectivityListenersRegistered && typeof window !== "undefined") {
      window.removeEventListener("offline", handleBrowserOffline);
      window.removeEventListener("online", handleBrowserOnline);
    }
    connectivityListenersRegistered = false;
    isInitialized = false;
    consecutiveFailures = 0;
    apiUrl.value = "";
    apiConfigured.value = false;
    apiStatus.value = "checking";
    pingData.value = null;
  }
}
