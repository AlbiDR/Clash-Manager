// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { DATA_STALENESS_THRESHOLD } from "../config";
import { useBlueprintMode } from "./useBlueprintMode";
import { useClashSync } from "./useClashSync";
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { WebAppData } from "../types";

/**
 * CLASH MANAGER - Central Data Store (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: High-integrity state management for clan-wide datasets.
 * Features: Background Synchronization, Cache Persistence, Reactive Deltas.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The `useClashDataStore` serves as the authoritative source for clan-wide data,
 * including roster members, war history, and recruitment pools. It implements
 * a "Stale-While-Revalidate" strategy, loading from IndexedDB immediately on
 * boot and updating from the Supabase backend in the background.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Data Flow:** Supabase Views -> Valibot Validation -> Reactive State -> Persistent Cache (IndexedDB).
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */
export const useClashDataStore = defineStore("clashData", () => {
  // --- PRIVATE STATE ---

  /**
   * The central dataset containing all clan and recruitment data.
   * Initialized as null and hydrated via `loadLocal` or `refreshFromSupabase`.
   */
  const data = ref<WebAppData | null>(null);

  // --- DEPENDENCIES ---
  const blueprint = useBlueprintMode();

  // [REFACTOR] DELEGATION: Structural Surgery Stage 9
  // Rationale: Decompose monolithic store (>400 lines) by extracting
  // sync and persistence logic to a specialized service.
  const sync = useClashSync(data);

  // --- GETTERS ---

  /** Direct access to the clan roster (Leaderboard) for Layer 3 views. */
  const members = computed(() => data.value?.lb || []);

  /** Direct access to the recruitment pool (Headhunter) for Layer 3 views. */
  const recruits = computed(() => data.value?.hh || []);

  /** The human-readable ISO-8601 timestamp of when the server generated this payload. */
  const lastUpdated = computed(() => data.value?.timestamp || "");

  /** Final resolution of where data was fetched from; used for debug badges in the footer. */
  const currentSource = computed(() => data.value?.dataSource || sync.dataSource.value);

  /** Authoritative remote generation time used to detect stale background sync cycles. */
  const remoteSyncTime = computed(() => data.value?.remoteTimestamp || sync.remoteTimestamp.value);

  /** Logic boundary: Marks data as 'STALE' if older than 30 minutes to prompt background refresh. */
  const isStale = computed(() => {
    if (!sync.lastSync.value) return true;
    return Date.now() - sync.lastSync.value > DATA_STALENESS_THRESHOLD;
  });

  /** Indicates the store is ready for consumption. Guards components from accessing null `data`. */
  const isHydrated = computed(() => data.value !== null);

  /** Centralized loading state for pull-to-refresh and initial boot indicators. */
  const isRefreshing = computed(() => sync.loading.value);

  /** The authoritative age of the client's dataset in milliseconds. */
  const lastSyncTime = computed(() => sync.lastSync.value);

  // --- ACTIONS ---

  /**
   * [DIAGNOSTIC] TRIGGER UPDATE
   *
   * @remarks
   * Satisfies ADR Section IV: Operational Security.
   * Forces the Service Worker to skip-waiting and activate the next version.
   * This is used when the client detects a newer PWA version is available via
   * the `updatefound` event.
   *
   * @sideeffects
   * - COMMUNICATES with the Service Worker via `postMessage`.
   * - TRIGGERS a page reload via the SW's `controllerchange` listener.
   */
  async function triggerUpdate() {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const registration = await navigator.serviceWorker.getRegistration();
    // [THREAT:] Stale Service Workers can cause version mismatch pathogens where the
    // client logic and backend schemas drift.
    // [DECISION LOG] Manual trigger bypasses browser-controlled update timing to
    // ensure the client transitions to the latest protocol immediately.
    if (registration?.waiting) {
      console.debug("[Store] Sending SKIP_WAITING to waiting worker...");
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  return {
    /**
     * Authoritative reactive state containing the full validated dataset.
     * @remarks Satisfies ADR Section III: Validation Boundaries.
     */
    data,
    /**
     * Reactive flag indicating if a synchronization operation is in progress.
     * Brokered from {@link useClashSync}.
     */
    loading: sync.loading,
    /**
     * Unix timestamp (ms) representing the authoritative age of the local data.
     * Brokered from {@link useClashSync}.
     */
    lastSync: sync.lastSync,
    /**
     * The most recent synchronization error message, if any.
     * Brokered from {@link useClashSync}.
     */
    syncError: sync.syncError,
    /**
     * Indicates the provenance of the dataset (e.g., "SUPABASE").
     * Brokered from {@link useClashSync}.
     */
    dataSource: sync.dataSource,
    /**
     * Authoritative timestamp from the last successful Supabase fetch.
     * Brokered from {@link useClashSync}.
     */
    remoteTimestamp: sync.remoteTimestamp,
    /**
     * Detailed technical diagnosis from the last Supabase sync attempt.
     * Brokered from {@link useClashSync}.
     */
    syncStatus: sync.syncStatus,

    // Getters
    members,
    recruits,
    lastUpdated,
    currentSource,
    remoteSyncTime,
    /**
     * Computed Unix timestamp (ms) of the server's dataset compilation.
     * Brokered from {@link useClashSync}.
     */
    lastCompiledTime: computed(() => sync.lastCompiled.value),
    /**
     * Computed Unix timestamp (ms) of the server's last fetch from Supercell.
     * Brokered from {@link useClashSync}.
     */
    lastFetchedTime: computed(() => sync.lastFetched.value),
    isStale,
    isHydrated,
    isRefreshing,
    lastSyncTime,

    // Actions
    /**
     * Hydrates the store from the local IndexedDB cache.
     * Brokered from {@link useClashSync}.
     */
    loadLocal: sync.loadLocal,
    /**
     * Manually updates the service state with an external payload.
     * Brokered from {@link useClashSync}.
     */
    updateLocalData: sync.updateLocalData,
    /**
     * Executes a non-blocking background synchronization.
     * Brokered from {@link useClashSync}.
     */
    startBackgroundSync: sync.startBackgroundSync,
    /** Alias for refreshFromSupabase to satisfy generic controller contracts. */
    refresh: sync.refreshFromSupabase,
    /**
     * Triggers a high-priority foreground synchronization from Supabase.
     * Brokered from {@link useClashSync}.
     */
    refreshFromSupabase: sync.refreshFromSupabase,
    /**
     * Patches a specific player's data in the local state.
     * Brokered from {@link useClashSync}.
     */
    updatePlayerLocally: sync.updatePlayerLocally,
    triggerUpdate
  };
});
