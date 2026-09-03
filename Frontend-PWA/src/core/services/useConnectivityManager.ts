// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, getCurrentInstance, onUnmounted, ref, unref } from "vue";
import { useClashDataStore } from "./useClashDataStore";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { formatTimeAgo } from "../utils/time";
import { DATA_STALENESS_MINUTES } from "../config";
import type { HubHealth, HubMetadata } from "../types";

/**
 * CONNECTIVITY MANAGER (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates data provenance, synchronization health, and 
 * UI-level connectivity indicators.
 * Features: Confidence Scoring, Sync Lifecycle Management, Metadata Normalization.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The ConnectivityManager provides a high-level abstraction over the raw
 * sync state of the ClashDataStore and the physical network state. It calculates
 * a "Confidence Score" and "Hub Health" to drive the Connectivity Hub UI.
 *
 * Satisfies ADR Section III: Data Flow & Transactional Integrity. It acts as
 * the authoritative source for data provenance, ensuring the UI accurately
 * reflects the freshness and reliability of the current dataset.
 *
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 * - Import Boundaries: Restricted to other Layer 1 services and utils.
 */

/**
 * Primary composable for managing and observing connectivity health.
 *
 * @remarks
 * Provides reactive connectivity telemetry including composite health ratings,
 * provenance metadata, and manual refresh controls for the PWA shell.
 *
 * @returns Object containing connectivity state and orchestration methods:
 * - `hubHealth`: Reactive status object for UI indicators (`HubHealth`).
 * - `metadata`: Reactive provenance and age metadata (`HubMetadata`).
 * - `isRefreshing`: Computed boolean indicating if a sync is in progress.
 * - `refresh`: Method to trigger a manual data synchronization.
 */
export function useConnectivityManager() {
  const store = useClashDataStore();
  const { status: networkStatus } = useConnectionStatus();
  const { apiStatus } = useApiState();

  /**
   * Authoritative metadata regarding data provenance and age.
   *
   * @remarks
   * Centralizes the resolution of raw store timestamps into domain-friendly
   * formatted strings and logical minutes. Evaluates relative data age against
   * system tick timestamps to compute staleness indicators.
   */
  // [DECISION LOG] Wall-clock time is not reactive, so a computed that reads
  // Date.now() is recomputed only when one of its STORE dependencies changes.
  // Data age therefore froze at whatever it was during the last sync and never
  // advanced, so the hub reported "2 minutes ago" indefinitely and the staleness
  // tier could not be reached by the passage of time alone. Ticking a ref gives
  // the computed a reactive clock to depend on.
  //
  // The cadence is the display's own granularity rather than a chosen number:
  // ageMinutes is floored to whole minutes, so re-evaluating once per minute is
  // exactly what it takes for the rendered value never to be stale.
  const AGE_TICK_MS = 60_000;
  const nowMs = ref(Date.now());

  // [GUARD] Only tick inside a component. Composables used from a store or a
  // service have no unmount hook to clear the interval on, and a timer that
  // outlives its caller is worse than the frozen value it fixes. Matches the
  // instance-check convention in useBroadcastChannel.
  const componentInstance = getCurrentInstance();
  if (componentInstance) {
    const ageTicker = setInterval(() => {
      nowMs.value = Date.now();
    }, AGE_TICK_MS);
    onUnmounted(() => clearInterval(ageTicker));
  }

  const metadata = computed((): HubMetadata => {
    const currentTimeMs = nowMs.value;
    const lastSyncTs = unref(store.lastSyncTime);
    // [DECISION LOG] Compute age relative to current epoch time; default to 0 if unsynced.
    const dataAgeMs = lastSyncTs ? currentTimeMs - lastSyncTs : 0;
    const dataAgeMinutes = Math.floor(dataAgeMs / 60000);

    return {
      source: unref(store.currentSource) || "LOCAL",
      age: lastSyncTs ? formatTimeAgo(lastSyncTs) : null,
      ageMinutes: dataAgeMinutes,
      lastCompiled: unref(store.lastCompiledTime) ? formatTimeAgo(unref(store.lastCompiledTime)) : null,
      lastFetched: unref(store.lastFetchedTime) ? formatTimeAgo(unref(store.lastFetchedTime)) : null,
      isStale: unref(store.isStale)
    };
  });

  /**
   * Derived health state for UI indicators.
   *
   * @remarks
   * Implements an 8-tier prioritization logic to resolve potentially
   * conflicting system states into a single authoritative health signal.
   */
  const hubHealth = computed((): HubHealth => {
    // 1. [PRIORITY: HIGHEST] Loading / Syncing State
    // [DECISION LOG] Active synchronization is the most relevant state for the user,
    // overriding even network failures as it indicates an attempt to recover.
    if (unref(store.loading)) {
      return {
        type: "loading",
        label: "SYNCING",
        confidence: 50
      };
    }

    // 1.5 Sync Error State
    // [THREAT: Unhandled Sync Exception] Unhandled sync failures leave store data in an unverified state;
    // dropping confidence score to 0 prevents presenting untrusted data as authoritative.
    if (unref(store.syncError)) {
      return {
        type: "error",
        label: "Sync Error",
        confidence: 0,
        diagnosis: unref(store.syncError) ?? undefined
      };
    }

    // 1.7 API Configuration Error
    // [THREAT: Invalid API Endpoint Ingress] Invalid API configuration prevents remote RPC execution;
    // short-circuiting health evaluation prevents invalid background requests.
    if (unref(apiStatus) === "unconfigured") {
      return {
        type: "error",
        label: "Invalid API URL",
        confidence: 0,
        diagnosis: "Backend Configuration Error"
      };
    }

    // 2. Offline / Hard Failure
    // [THREAT: Network Disconnection Blindspot] Physical disconnection prevents real-time revalidation;
    // reporting OFFLINE with 0 confidence alerts user to stale offline state.
    if (unref(networkStatus) === "offline") {
      return {
        type: "error",
        label: "OFFLINE",
        confidence: 0,
        diagnosis: "No Network Connection"
      };
    }

    // 3. Stale Data Warning
    // [THREAT: Silent Data Stale Drift] Data older than DATA_STALENESS_MINUTES is considered STALE,
    // signaling that a refresh is recommended before relying on cached analytics.
    if (metadata.value.ageMinutes >= DATA_STALENESS_MINUTES) {
      return {
        type: "warning",
        label: "STALE",
        confidence: 40,
        diagnosis: `Data is ${metadata.value.age} old`
      };
    }

    // 4. Nominal / Live (Supabase)
    // [DECISION LOG] Data sourced from the remote DB is the gold standard (Confidence: 100).
    if (unref(store.currentSource) === "SUPABASE") {
      return {
        type: "success",
        label: "DB",
        confidence: 100
      };
    }

    // 5. Nominal / Local
    // [DECISION LOG] Validated local hydration is successful but lacks remote verification (Confidence: 80).
    if (unref(store.isHydrated)) {
      return {
        type: "success",
        label: "LOCAL",
        confidence: 80
      };
    }

    // Fallback [PRIORITY: LOWEST]
    // [DECISION LOG] Default state during initial store bootstrap prior to hydration.
    return {
      type: "loading",
      label: "INITIALIZING",
      confidence: 10
    };
  });

  return {
    hubHealth,
    metadata,
    isRefreshing: computed(() => store.loading),
    refresh: store.refresh
  };
}
