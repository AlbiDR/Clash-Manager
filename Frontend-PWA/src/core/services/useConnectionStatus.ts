// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * CONNECTION STATUS SERVICE (Layer 1 Core)
 * ----------------------------------------------------------------------------
 * Rationale: Unifies physical network status and logical API availability.
 * Features: Automatic Listener Management, Priority-Based Status, Reactive Deltas.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This module provides a single source of truth for the application's connectivity
 * state. It monitors both the browser's physical connection (`navigator.onLine`)
 * and the application's ability to communicate with the Supabase backend (`apiStatus`).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Satisfaction:** Satisfies ADR Section IV: Resilience & Connectivity.
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @sideeffects
 * Attaches 'online' and 'offline' listeners to the window object at module initialization.
 */

import { useNetworkInfo } from "./useNetworkInfo";
import { useApiState } from "../api/useApiState";
import { ref, computed, readonly, type DeepReadonly, type Ref } from "vue";

/**
 * The consolidated status classification representing current network and API state.
 *
 * @remarks
 * - `online`: Physical network connected and API reported healthy.
 * - `offline`: Physical network disconnected or API unreachable/unconfigured.
 * - `syncing`: Active data sync, backend waking, or state revalidation in progress.
 * - `success-resolve`: Transient visual confirmation state post-synchronization.
 * - `slow`: Physical network connected but experiencing high latency or low bandwidth.
 */
export type ConnectionStatus =
  | "online"
  | "offline"
  | "syncing"
  | "success-resolve"
  | "slow";

/**
 * Module-level reactive singleton tracking physical online status.
 *
 * @remarks
 * [DECISION LOG] Shared at module level to guarantee instant, cross-composable sync
 * when window online/offline events fire without requiring event bus re-subscriptions.
 */
const isOnline = ref(navigator.onLine);

/**
 * Transient flag driving the temporary "success-resolve" visual animation post-sync.
 */
const isSuccessFading = ref(false);

/**
 * Manual sync override flag set during active background operations.
 */
const isSyncing = ref(false);

/**
 * Guard flag to enforce idempotent, single-attachment of window network listeners.
 */
let listenersAttached = false;

/**
 * Handler for physical window 'online' events.
 * Updates physical connectivity state immediately.
 */
function handleOnline() {
  isOnline.value = true;
}

/**
 * Handler for physical window 'offline' events.
 *
 * @remarks
 * [THREAT:] Sudden physical network disconnection invalidates active API calls.
 * Immediate update to `isOnline` triggers status re-evaluation without waiting for API timeouts.
 */
function handleOffline() {
  // Direct offline detection is usually reliable for "hard" disconnects
  isOnline.value = false;
}

// [DECISION LOG] Attach window listeners once at module import time to capture connectivity drops
// before any component mounts or composable is invoked.
if (!listenersAttached && typeof window !== "undefined") {
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  listenersAttached = true;
}

/**
 * Return contract interface for `useConnectionStatus`.
 */
export interface UseConnectionStatusReturn {
  /** Computed reactive status classification. */
  status: Ref<ConnectionStatus>;
  /** Read-only reactive boolean indicating physical network attachment. */
  isOnline: DeepReadonly<Ref<boolean>>;
  /** Reactive boolean indicating high latency or low throughput connection. */
  isSlow: Ref<boolean>;
  /** Effective network connection type (e.g., '4g', '3g', '2g', 'slow-2g'). */
  type: Ref<string>;
  /** Action to set manual syncing visual state. */
  setSyncing: (isSyncingActive: boolean) => void;
  /** Action to trigger transient success resolution animation. */
  setSuccess: () => void;
}

/**
 * COMPOSABLE: useConnectionStatus (Layer 1 Core)
 *
 * @remarks
 * Orchestrates physical and logical connection state.
 * It provides a unified status string derived from browser events,
 * API health checks, and active synchronization flags.
 *
 * @returns Object adhering to `UseConnectionStatusReturn`.
 */
export function useConnectionStatus(): UseConnectionStatusReturn {
  const { apiStatus } = useApiState();
  const { isSlowConnection, effectiveType } = useNetworkInfo();

  /**
   * Action to manually trigger the "syncing" visual state.
   *
   * @param isSyncingActive - True during active data transfer or synchronization.
   */
  function setSyncing(isSyncingActive: boolean) {
    isSyncing.value = isSyncingActive;
  }

  /**
   * Action to trigger a temporary "success" visual state after sync completes.
   *
   * @remarks
   * [DECISION LOG] Uses a 1800ms fade timeout to give tactile visual confirmation
   * of completion before reverting to normal idle online status, avoiding flickering.
   */
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
   * 4. Active Operations (Syncing/Checking/Waking/Stale)
   * 5. Network Degradation (Slow Warning)
   * 6. Idle (Stable Online)
   */
  const status = computed((): ConnectionStatus => {
    // 1. PHYSICAL DISCONNECTION: Immediate priority. If the browser is offline,
    // logical API states are irrelevant.
    // [THREAT:] Operating while physically offline causes unhandled network fetch errors.
    if (!isOnline.value) return "offline";

    // 2. LOGICAL DISCONNECTION: If the backend is unreachable or unconfigured,
    // we are effectively offline for application purposes.
    // [DECISION LOG] Treat unconfigured API endpoint as offline to prevent requests to bogus targets.
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

/**
 * Test Helper: Resets module-level reactive connection state during unit tests.
 *
 * @remarks
 * [DECISION LOG] Environment-guarded via `import.meta.env.TEST` to prevent accidental execution
 * or leakage in production builds. Resets singleton reactive variables to initial online defaults.
 */
export function resetConnectionState() {
  if (import.meta.env.TEST) {
    isSuccessFading.value = false;
    isSyncing.value = false;
    // Reset online status to default (true)
    isOnline.value = true;
  }
}
