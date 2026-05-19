// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, unref, type ComputedRef, type Ref } from "vue";
import { useClashDataStore } from "./useClashDataStore";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { formatTimeAgo } from "../utils/formatters";

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
 * Represents the unified health status of the connectivity hub.
 */
export interface HubHealth {
  /** Visual classification for UI styling (color/icon). */
  type: "success" | "warning" | "error" | "loading";
  /** Short, human-readable status label. */
  label: string;
  /** Percentage indicating data reliability (0-100). */
  confidence: number;
  /** Detailed technical diagnosis or error message. */
  diagnosis?: string;
}

/**
 * Authoritative metadata regarding the origin and age of the current data.
 */
export interface HubMetadata {
  /** The identified backend source (e.g., "SUPABASE", "LOCAL"). */
  source: string;
  /** Human-readable age of the data (e.g., "5m ago"). */
  age: string | null;
  /** Data age in minutes for logical thresholding. */
  ageMinutes: number;
  /** Formatted time when the remote dataset was last compiled. */
  lastCompiled: string | null;
  /** Formatted time when the backend last fetched raw API data. */
  lastFetched: string | null;
  /** Flag indicating if the data has exceeded the staleness threshold. */
  isStale: boolean;
}

/**
 * Primary composable for managing and observing connectivity health.
 *
 * @returns {Object} Connectivity state and orchestration methods.
 * - `hubHealth`: Reactive status object for UI indicators.
 * - `metadata`: Reactive provenance and age metadata.
 * - `isRefreshing`: Boolean indicating if a sync is in progress.
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
   * formatted strings and logical minutes.
   */
  const metadata = computed((): HubMetadata => {
    const now = Date.now();
    const lastSyncTs = unref(store.lastSyncTime);
    const ageMs = lastSyncTs ? now - lastSyncTs : 0;
    const ageMins = Math.floor(ageMs / 60000);

    return {
      source: unref(store.currentSource) || "LOCAL",
      age: lastSyncTs ? formatTimeAgo(lastSyncTs) : null,
      ageMinutes: ageMins,
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
    // Rationale: Active synchronization is the most relevant state for the user,
    // overriding even network failures as it indicates an attempt to recover.
    if (unref(store.loading)) {
      return {
        type: "loading",
        label: "SYNCING",
        confidence: 50
      };
    }

    // 1.5 Sync Error State
    // Rationale: If a sync failed, we must report it immediately as confidence
    // in the displayed data is now unknown.
    if (unref(store.syncError)) {
      return {
        type: "error",
        label: "Sync Error",
        confidence: 0,
        diagnosis: unref(store.syncError)
      };
    }

    // 1.7 API Configuration Error
    // Rationale: Invalid configuration prevents all remote operations.
    if (unref(apiStatus) === "error") {
      return {
        type: "error",
        label: "Invalid API URL",
        confidence: 0,
        diagnosis: "Backend Configuration Error"
      };
    }

    // 2. Offline / Hard Failure
    // Rationale: Physical disconnection is a critical state that limits data freshness.
    if (unref(networkStatus) === "offline") {
      return {
        type: "error",
        label: "OFFLINE",
        confidence: 0,
        diagnosis: "No Network Connection"
      };
    }

    // 3. Stale Data Warning
    // Rationale: Data older than 30 minutes is considered STALE according to
    // the adaptive pipeline design, signaling that a refresh is recommended.
    if (metadata.value.ageMinutes >= 30) {
      return {
        type: "warning",
        label: "STALE",
        confidence: 40,
        diagnosis: `Data is ${metadata.value.age} old`
      };
    }

    // 4. Nominal / Live (Supabase)
    // Rationale: Data sourced from the remote DB is the gold standard (Confidence: 100).
    if (unref(store.currentSource) === "SUPABASE") {
      return {
        type: "success",
        label: "DB",
        confidence: 100
      };
    }

    // 5. Nominal / Local
    // Rationale: Validated local hydration is successful but lacks remote verification.
    if (unref(store.isHydrated)) {
      return {
        type: "success",
        label: "LOCAL",
        confidence: 80
      };
    }

    // Fallback [PRIORITY: LOWEST]
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
