// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CONNECTION STATUS SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Unifies physical network status and logical API availability.
 * Features: Automatic Listener Management, Priority-Based Status, Reactive Deltas.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This module provides a single source of truth for the application's connectivity
 * state. It monitors both the browser's physical connection (navigator.onLine)
 * and the application's ability to communicate with the Supabase backend (apiStatus).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @sideeffects
 * Attaches 'online' and 'offline' listeners to the window object at the module level.
 */

import { useNetworkInfo } from "./useNetworkInfo";
import { useApiState } from "../api/useApiState";
import { ref, computed, readonly, watch } from "vue";
export type ConnectionStatus =
  | "online"
  | "offline"
  | "syncing"
  | "success-resolve"
  | "slow";

const isOnline = ref(navigator.onLine);
const isSuccessFading = ref(false);
const isSyncing = ref(false);

// Module-level event listener initialization
let listenersAttached = false;

function handleOnline() {
  isOnline.value = true;
}

function handleOffline() {
  // Direct offline detection is usually reliable for "hard" disconnects
  isOnline.value = false;
}

// Attach listeners once at module level
if (!listenersAttached && typeof window !== "undefined") {
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  listenersAttached = true;
}

/**
 * COMPOSABLE: useConnectionStatus
 *
 * @remarks
 * Orchestrates physical and logical connection state.
 * It provides a unified status string derived from browser events,
 * API health checks, and active synchronization flags.
 *
 * @returns
 * - `status`: A computed string representing the current connectivity state.
 * - `isOnline`: Reactive boolean indicating if the browser has a physical connection.
 * - `isSlow`: Boolean indicating if the connection is currently categorized as "slow".
 * - `type`: The effective network type (e.g., '4g', '3g', '2g').
 * - `setSyncing`: Action to manually trigger the "syncing" visual state.
 * - `setSuccess`: Action to trigger a temporary "success" visual state after sync completes.
 */
export function useConnectionStatus() {
  const { apiStatus } = useApiState();
  const { isSlowConnection, effectiveType } = useNetworkInfo();

  function setSyncing(val: boolean) {
    isSyncing.value = val;
  }

  function setSuccess() {
    isSuccessFading.value = true;
    setTimeout(() => {
      isSuccessFading.value = false;
    }, 1800);
  }

  /**
   * RESOLUTION: Status Priority Queue
   *
   * @remarks
   * Connectivity is determined by evaluating physical and logical constraints
   * in strict order. Higher priority statuses (e.g., hard offline) preempt
   * lower priority visual feedback (e.g., slow network warning).
   *
   * Priority Ordering:
   * 1. Hard Offline (Physical)
   * 2. Soft Offline (API Failure/Logical)
   * 3. Success Feedback (Transient Visual Priority)
   * 4. Active Operations (Syncing/Checking)
   * 5. Network Degradation (Slow Warning)
   * 6. Idle (Stable Online)
   */
  const status = computed((): ConnectionStatus => {
    // 1. PHYSICAL DISCONNECTION: Immediate priority. If the browser is offline,
    // logical API states are irrelevant.
    if (!isOnline.value) return "offline";

    // 2. LOGICAL DISCONNECTION: If the backend is unreachable or unconfigured,
    // we are effectively offline for application purposes.
    if (apiStatus.value === "offline" || apiStatus.value === "unconfigured") return "offline";

    // 3. SUCCESS FEEDBACK: High visual priority to confirm a recovery or sync completion.
    if (isSuccessFading.value) return "success-resolve";

    // 4. ACTIVE OPERATIONS: All in-progress or recovery states map to 'syncing'
    // to drive UI progress indicators.
    if (
      isSyncing.value || 
      apiStatus.value === "checking" || 
      apiStatus.value === "waking" || 
      apiStatus.value === "stale"
    ) {
      return "syncing";
    }

    // 5. NETWORK DEGRADATION: Warning for high latency or low-throughput environments.
    if (isSlowConnection.value) return "slow";

    // 6. STABLE STATE: Default idle online state when all conditions are healthy.
    if (apiStatus.value === "online") return "online";

    // FALLBACK: Default to 'syncing' for unknown or intermediate states.
    return "syncing";
  });

  return {
    status,
    isOnline: readonly(isOnline),
    isSlow: isSlowConnection,
    type: effectiveType,
    setSyncing,
    setSuccess,
  };
}

// Test Helper
export function resetConnectionState() {
  if (import.meta.env.TEST) {
    // We need to access the variables.
    // Since they are not exported, we can't easily reset them from outside unless this function is inside the module scope.
    // Ideally this function sets the non-exported refs.
    // Note: isOnline, isSyncing, etc are module-level variables.
    // However, they are const refs?
    // const isOnline = ref(...) -> reactive object. We can change .value.

    // Check if variables are accessible here.
    // They are defined at module level (lines 12-14).
    // So this works.
    isSuccessFading.value = false;
    isSyncing.value = false;
    // reset online status to default (true)
    isOnline.value = true;
  }
}
