// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useConnectionStatus } from "./useConnectionStatus";
import { useWakeLock } from "./useWakeLock";
import { fetchRemote, lastSyncStatus } from "../api/SupabaseClient";
import { loadCache, saveCache } from "./StorageService";
import { useBlueprintMode } from "./useBlueprintMode";
import { MemberSchema, WebAppDataSchema } from "../api/DataSchemas";
import * as v from "valibot";
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { WebAppData, PlayerTag } from "../types";

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

  /** The central dataset containing all clan and recruitment data. Null until hydration completes. */
  const data = ref<WebAppData | null>(null);

  /** Reactive flag to prevent concurrent synchronization cycles and drive UI progress indicators. */
  const loading = ref(false);

  /** Unix timestamp (ms) representing the authoritative age of the local data. Used for TTL checks. */
  const lastSync = ref<number>(0);

  /** Stores the most recent sync error message. Suppressed until failure threshold to prevent UI flicker. */
  const syncError = ref<string | null>(null);

  /** Fault tolerance tracker; triggers user-visible errors only after 3 consecutive failures. */
  const consecutiveSyncFailures = ref(0);

  /** Indicates the provenance of the dataset (SUPABASE). */
  const dataSource = ref<"SUPABASE" | null>(null);

  /** Authoritative diagnosis state from the last Supabase sync attempt. */
  const syncStatus = lastSyncStatus;

  /** Authoritative timestamp from the last successful Supabase fetch. */
  const remoteTimestamp = ref<number | null>(null);

  /** Server-side compilation marker; indicates when the database last processed raw API data. */
  const lastCompiled = ref<number | null>(null);

  /** Raw API fetch marker; indicates the last time the server queried Supercell's endpoint. */
  const lastFetched = ref<number | null>(null);

  // --- DEPENDENCIES ---
  const { isOnline } = useConnectionStatus();
  const wakeLock = useWakeLock();
  const blueprint = useBlueprintMode();

  // --- GETTERS ---

  /** Direct access to the clan roster (Leaderboard) for Layer 3 views. */
  const members = computed(() => data.value?.lb || []);

  /** Direct access to the recruitment pool (Headhunter) for Layer 3 views. */
  const recruits = computed(() => data.value?.hh || []);

  /** The human-readable ISO-8601 timestamp of when the server generated this payload. */
  const lastUpdated = computed(() => data.value?.timestamp || "");

  /** Final resolution of where data was fetched from; used for debug badges in the footer. */
  const currentSource = computed(() => data.value?.dataSource || dataSource.value);

  /** Authoritative remote generation time used to detect stale background sync cycles. */
  const remoteSyncTime = computed(() => data.value?.remoteTimestamp || remoteTimestamp.value);

  /** Logic boundary: Marks data as 'STALE' if older than 30 minutes to prompt background refresh. */
  const isStale = computed(() => {
    if (!lastSync.value) return true;
    return Date.now() - lastSync.value > 1000 * 60 * 30; // 30 min TTL
  });

  /** Indicates the store is ready for consumption. Guards components from accessing null `data`. */
  const isHydrated = computed(() => data.value !== null);

  /** Centralized loading state for pull-to-refresh and initial boot indicators. */
  const isRefreshing = computed(() => loading.value);

  /** The authoritative age of the client's dataset in milliseconds. */
  const lastSyncTime = computed(() => lastSync.value);

  // --- ACTIONS ---

  /**
   * [INTERNAL] Authoritative state commitment for WebAppData.
   *
   * @remarks
   * Rationale: Centralizes the success path for all sync operations to ensure
   * metadata, persistence, and error-resets are handled identically.
   * This facilitates the "Structural Integrity" goal by eliminating duplication
   * and providing a clinical success boundary.
   */
  async function commitSyncResult(payload: WebAppData) {
    data.value = payload;

    // [FIX] SERVER-AUTHORITATIVE FRESHNESS: Target A [1]
    // Rationale: Use payload's generation timestamp to calculate age,
    // preventing the "Just Now" reset on every hydration/refresh.
    lastSync.value = new Date(payload.timestamp).getTime();

    // Metadata Sync
    dataSource.value = payload.dataSource || null;
    remoteTimestamp.value = payload.remoteTimestamp || null;
    lastCompiled.value = payload.lastCompiled || null;
    lastFetched.value = payload.lastFetched || null;

    // Status Reset
    consecutiveSyncFailures.value = 0;
    syncError.value = null;

    // PERSISTENCE DURABILITY: Target A [2]
    try {
      await saveCache(payload);
    } catch (persistenceError: unknown) {
      // THREAT: Silent persistence failure leads to data loss on session restart.
      // Descriptively naming 'persistenceError' ensures failure modes are explicit.
      console.error("[Store] Commit persistence failed:", persistenceError instanceof Error ? persistenceError.message : String(persistenceError));
    }
  }

  /**
   * Loads the dataset from the persistent browser cache (IndexedDB).
   *
   * @remarks
   * This action is triggered immediately on app bootstrap to ensure zero-latency
   * initial render (LCP optimization). It bypasses network requests by reading
   * from the Layer 0 StorageService.
   *
   * @sideeffects
   * - WRITES to reactive `data` and `lastSync` state on success.
   * - READS from `IndexedDB` via `loadCache`.
   */
  async function loadLocal() {
    try {
      const cached = await loadCache();
      if (!cached) return;

      // [GUARD] VALIDATION BOUNDARY: Target B [1]
      const result = v.safeParse(WebAppDataSchema, cached);
      if (result.success) {
        console.debug(`[Store] Hydrated from cache. Source: ${result.output.dataSource || "SUPABASE"}`);
        await commitSyncResult(result.output);
      } else {
        console.warn("[Store] Local cache validation failed, skipping hydration:", result.issues);
      }
    } catch (hydrationError: unknown) {
      // THREAT: Corrupt disk state causing app boot failure.
      // desriptively naming 'hydrationError' distinguishes it from network-driven sync failures.
      console.error("[Store] Cache hydration failed:", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
    }
  }

  /**
   * Directly updates the local data state and persists it to the cache.
   *
   * @remarks
   * Implements a strict validation boundary (Target B [1]) to ensure that
   * external payloads (e.g., from Manual Ingest) do not corrupt the store.
   *
   * @param payload - The raw data object (usually WebAppData shape).
   */
  async function updateLocalData(payload: unknown) {
    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    const result = v.safeParse(WebAppDataSchema, payload);
    if (!result.success) {
      console.warn("[Store] Local update rejected: Invalid WebAppData structure", result.issues);
      return;
    }

    await commitSyncResult(result.output);
  }

  /**
   * Triggers a forced, immediate synchronization with the Supabase backend.
   *
   * @remarks
   * Provides instantaneous data updates for recruitment and roster status.
   *
   * @sideeffects
   * - TRIGGERS `WakeLock` to prevent mobile sleep during fetch.
   * - FALLS BACK to `startBackgroundSync` on failure.
   */
  async function refreshFromSupabase() {
    if (loading.value) return;
    if (!isOnline.value) return;

    loading.value = true;
    try {
      await wakeLock.request();
      const remoteData = await fetchRemote({ force: true });
      
      const result = v.safeParse(WebAppDataSchema, remoteData);
      if (!result.success) {
        console.error("[Store] Data Validation Failure Details:", JSON.stringify(result.issues, null, 2));
        throw new Error("Remote data validation failed");
      }

      console.debug(`[Store] Refresh successful. Source: ${result.output.dataSource}`);
      await commitSyncResult(result.output);
    } catch (supabaseRefreshError: unknown) {
      console.warn("[Store] Supabase refresh failed:", supabaseRefreshError);

      // Ensure loading guard is cleared before fallback sync to prevent deadlock.
      loading.value = false;
      await wakeLock.release();

      return startBackgroundSync(true);
    } finally {
      // Ensure loading is cleared and lock is released even on success
      if (loading.value) {
        loading.value = false;
        await wakeLock.release();
      }
    }
  }

  /**
   * Orchestrates a background synchronization with the Supabase backend.
   *
   * @remarks
   * Keeps the client in sync with the authoritative Supabase views.
   * Employs logical fault tolerance, only surfacing errors after 3 failed attempts
   * to mitigate noise from transient network fluctuations.
   *
   * @param force - If true, ignores `isOnline` and `loading` guards for a mandatory fetch.
   *
   * @sideeffects
   * - TRIGGERS `WakeLock` to prevent mobile sleep during fetch.
   */
  async function startBackgroundSync(force = false) {
    if (loading.value) return;
    if (!isOnline.value && !force) return;

    loading.value = true;
    // Note: syncError is not cleared immediately if we have data, 
    // to avoid flickering the UI if it's already showing an error.

    try {
      // Use WakeLock during heavy sync to prevent mobile sleep
      await wakeLock.request();
      
      const remoteData = await fetchRemote({ force });

      // [GUARD] VALIDATION BOUNDARY: Target B [1]
      const result = v.safeParse(WebAppDataSchema, remoteData);
      if (!result.success) {
        throw new Error("Remote data validation failed");
      }

      await commitSyncResult(result.output);
    } catch (backgroundSyncError: unknown) {
      // THREAT: Network instability leading to stale data and user misinformation.
      // Descriptively naming 'backgroundSyncError' ensures logical containment within the sync handler
      // and avoids shadowing the global 'syncError' ref.
      consecutiveSyncFailures.value++;
      
      const errorMessage = backgroundSyncError instanceof Error ? backgroundSyncError.message : "Sync failed";
      
      // LOGICAL FAULT TOLERANCE:
      // If we already have data (isHydrated), only surfacing the error after 3 consecutive 
      // failures to avoid alarming the user with transient network glitches.
      if (!isHydrated.value || consecutiveSyncFailures.value >= 3) {
        syncError.value = errorMessage;
      }
      
      console.warn(`[Store] Background sync failed (Attempt ${consecutiveSyncFailures.value}):`, backgroundSyncError);
    } finally {
      loading.value = false;
      await wakeLock.release();
    }
  }

  /**
   * Manually updates a specific player profile within the store.
   *
   * @remarks
   * Useful for immediate feedback after a local edit or a single-player refresh.
   * Implements a strict validation boundary (Target B [1]) and respects
   * the clinical isolation of the store state by cloning the array to trigger reactivity.
   *
   * @param playerTag - The unique Supercell tag of the player to update.
   * @param partial - The subset of player properties to merge into the state.
   *
   * @sideeffects
   * - MUTATES reactive `data.lb` array.
   * - WRITES to `IndexedDB` via `saveCache`.
   */
  function updatePlayerLocally(playerTag: PlayerTag, partial: unknown) {
    if (!data.value) return;

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // Rationale: Ensure that manual local updates do not corrupt the central store.
    const validation = v.safeParse(v.partial(MemberSchema), partial);
    if (!validation.success) {
      console.warn("[Store] Local update rejected: Invalid partial data", validation.issues);
      return;
    }

    const memberIndex = data.value.lb.findIndex(member => member.id === playerTag);

    if (memberIndex !== -1) {
      // TRANSACIONAL INTEGRITY: Clone the array to trigger reactivity correctly
      // and ensure that we're not mutating a readonly property.
      const newLb = [...data.value.lb];
      newLb[memberIndex] = {
        ...newLb[memberIndex],
        ...validation.output
      };

      const updatedData = {
        ...data.value,
        lb: newLb
      };

      data.value = updatedData;

      // PERSISTENCE DURABILITY: Target A [2]
      saveCache(updatedData).catch(persistenceError => {
        // THREAT: Local state mutation not surviving session restart.
        // Descriptively naming 'persistenceError' aids in diagnosing disk-write failures.
        console.error("[Store] Failed to persist player update:", persistenceError);
      });
    }
  }

  /**
   * [DIAGNOSTIC] TRIGGER UPDATE
   *
   * @remarks
   * Forces the Service Worker to skip-waiting and activate the next version.
   * This is used when the client detects a newer PWA version is available.
   *
   * @sideeffects
   * - COMMUNICATES with the Service Worker via `postMessage`.
   */
  async function triggerUpdate() {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      console.debug("[Store] Sending SKIP_WAITING to waiting worker...");
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }

  return {
    // State
    data,
    loading,
    lastSync,
    syncError,
    dataSource,
    remoteTimestamp,
    syncStatus,

    // Getters
    members,
    recruits,
    lastUpdated,
    currentSource,
    remoteSyncTime,
    /** Computed Unix timestamp (ms) of the server's dataset compilation. */
    lastCompiledTime: computed(() => lastCompiled.value),
    /** Computed Unix timestamp (ms) of the server's last fetch from Supercell. */
    lastFetchedTime: computed(() => lastFetched.value),
    isStale,
    isHydrated,
    isRefreshing,
    lastSyncTime,

    // Actions
    loadLocal,
    updateLocalData,
    startBackgroundSync,
    /** Alias for refreshFromSupabase to satisfy generic controller contracts. */
    refresh: refreshFromSupabase,
    refreshFromSupabase,
    updatePlayerLocally
  };
});
