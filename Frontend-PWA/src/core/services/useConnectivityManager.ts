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
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 */

export interface HubHealth {
  type: "success" | "warning" | "error" | "loading";
  label: string;
  confidence: number; // 0 to 100
  diagnosis?: string;
}

export interface HubMetadata {
  source: string;
  age: string | null;
  ageMinutes: number;
  lastCompiled: string | null;
  lastFetched: string | null;
  isStale: boolean;
}

export function useConnectivityManager() {
  const store = useClashDataStore();
  const { status: networkStatus } = useConnectionStatus();
  const { apiStatus } = useApiState();

  /**
   * Authoritative metadata regarding data provenance and age.
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
   */
  const hubHealth = computed((): HubHealth => {
    // 1. Loading / Syncing State
    if (unref(store.loading)) {
      return {
        type: "loading",
        label: "SYNCING",
        confidence: 50
      };
    }

    // 1.5 Sync Error State
    if (unref(store.syncError)) {
      return {
        type: "error",
        label: "Sync Error",
        confidence: 0,
        diagnosis: unref(store.syncError)
      };
    }

    // 1.7 API Configuration Error
    if (unref(apiStatus) === "error") {
      return {
        type: "error",
        label: "Invalid API URL",
        confidence: 0,
        diagnosis: "Backend Configuration Error"
      };
    }

    // 2. Offline / Hard Failure
    if (unref(networkStatus) === "offline") {
      return {
        type: "error",
        label: "OFFLINE",
        confidence: 0,
        diagnosis: "No Network Connection"
      };
    }

    // 3. Stale Data Warning
    if (metadata.value.ageMinutes >= 30) {
      return {
        type: "warning",
        label: "STALE",
        confidence: 40,
        diagnosis: `Data is ${metadata.value.age} old`
      };
    }

    // 4. Nominal / Live (Supabase)
    if (unref(store.currentSource) === "SUPABASE") {
      return {
        type: "success",
        label: "DB",
        confidence: 100
      };
    }

    // 5. Nominal / Local
    if (unref(store.isHydrated)) {
      return {
        type: "success",
        label: "LOCAL",
        confidence: 80
      };
    }

    // Fallback
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
