// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useConnectionStatus } from "./useConnectionStatus";
import { useWakeLock } from "./useWakeLock";
import { fetchRemote, lastHubDiagnosis } from "../api/GasClient";
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
 * The useClashDataStore serves as the authoritative source for clan-wide data,
 * including roster members, war history, and recruitment pools. It implements
 * a "Stale-While-Revalidate" strategy, loading from IndexedDB immediately on
 * boot and updating from the GAS backend in the background.
 */
export const useClashDataStore = defineStore("clashData", () => {
  // --- PRIVATE STATE ---
  const data = ref<WebAppData | null>(null);
  const loading = ref(false);
  const lastSync = ref<number>(0);
  const syncError = ref<string | null>(null);
  const consecutiveSyncFailures = ref(0);
  const dataSource = ref<"WORKER" | "GAS" | null>(null);
  const hubDiagnosis = lastHubDiagnosis;
  const hubTimestamp = ref<number | null>(null);
  const lastCompiled = ref<number | null>(null);
  const lastFetched = ref<number | null>(null);

  // --- DEPENDENCIES ---
  const { isOnline } = useConnectionStatus();
  const wakeLock = useWakeLock();
  const blueprint = useBlueprintMode();

  // --- GETTERS ---
  const members = computed(() => data.value?.lb || []);
  const recruits = computed(() => data.value?.hh || []);
  const lastUpdated = computed(() => data.value?.timestamp || "");
  const currentSource = computed(() => data.value?.dataSource || dataSource.value);
  const hubSyncTime = computed(() => data.value?.hubTimestamp || hubTimestamp.value);

  const isStale = computed(() => {
    if (!lastSync.value) return true;
    return Date.now() - lastSync.value > 1000 * 60 * 30; // 30 min TTL
  });

  const isHydrated = computed(() => data.value !== null);
  const isRefreshing = computed(() => loading.value);
  const lastSyncTime = computed(() => lastSync.value);

  // --- ACTIONS ---

  /**
   * Loads the dataset from the persistent browser cache (IndexedDB).
   * This action is triggered immediately on app bootstrap to ensure zero-latency
   * initial render (LCP optimization).
   */
  async function loadLocal() {
    try {
      const cached = await loadCache();
      if (!cached) return;

      // [GUARD] VALIDATION BOUNDARY: Target B [1]
      // THREAT: Corrupt IndexedDB state causing silent application crashes.
      const result = v.safeParse(WebAppDataSchema, cached);
      if (result.success) {
        const output = result.output as WebAppData;
        data.value = output;
        
        // [FIX] SERVER-AUTHORITATIVE FRESHNESS: Target A [1]
        // Rationale: Use the payload's own generation timestamp to calculate age,
        // preventing the "Just Now" reset on every hydration/refresh.
        lastSync.value = new Date(output.timestamp).getTime();
        
        console.debug(`💾 [Store] Hydrated from cache. Source: ${output.dataSource || "GAS"}`);
        dataSource.value = output.dataSource || null;
        hubTimestamp.value = output.hubTimestamp || null;
        lastCompiled.value = output.lastCompiled || null;
        lastFetched.value = output.lastFetched || null;
      } else {
        console.warn("[Store] Local cache validation failed, skipping hydration:", result.issues);
      }
    } catch (e: unknown) {
      console.error("[Store] Cache hydration failed:", e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Directly updates the local data state and persists it to the cache.
   *
   * @remarks
   * Implements a strict validation boundary (Target B [1]) to ensure that
   * external payloads (e.g., from Turbo Scan) do not corrupt the store.
   */
  async function updateLocalData(payload: unknown) {
    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    const result = v.safeParse(WebAppDataSchema, payload);
    if (!result.success) {
      console.warn("[Store] Local update rejected: Invalid WebAppData structure", result.issues);
      return;
    }

    data.value = result.output as WebAppData;

    // PERSISTENCE DURABILITY: Target A [2]
    try {
      await saveCache(result.output);
    } catch (e: unknown) {
      console.error("[Store] Failed to persist local update:", e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Orchestrates a direct synchronization with the Worker Hub.
   * Rationale: Provides instantaneous data updates by bypassing the GAS
   * orchestration layer, primarily for recruitment and roster status.
   */
  async function refreshWorker() {
    if (loading.value) return;
    if (!isOnline.value) return;

    loading.value = true;
    try {
      await wakeLock.request();
      const remoteData = await fetchRemote({ force: true, preferWorker: true });
      
      const validation = v.safeParse(WebAppDataSchema, remoteData);
      if (!validation.success) {
        console.error("[Store] Worker Validation Failure Details:", JSON.stringify(validation.issues, null, 2));
        throw new Error("Worker data validation failed");
      }

      const output = validation.output as WebAppData;
      data.value = output;
      lastSync.value = new Date(output.timestamp).getTime();
      
      console.debug(`🌐 [Store] Refresh successful. Attribution: ${output.dataSource || "GAS"}`);
      dataSource.value = output.dataSource || null;
      hubTimestamp.value = output.hubTimestamp || null;
      lastCompiled.value = output.lastCompiled || null;
      lastFetched.value = output.lastFetched || null;
      consecutiveSyncFailures.value = 0;
      syncError.value = null;
      await saveCache(validation.output as WebAppData);
    } catch (e: unknown) {
      console.warn("[Store] Worker-direct refresh failed:", e);
      // Falling back to full sync if direct worker fails
      return startBackgroundSync(true);
    } finally {
      loading.value = false;
      await wakeLock.release();
    }
  }

  /**
   * Orchestrates a background synchronization with the Google Apps Script backend.
   * Rationale: Keeps the client in sync with the authoritative server-side database.
   * Side Effects: Updates IndexedDB on success.
   */
  async function startBackgroundSync(force = false) {
    if (loading.value) return;
    if (!isOnline.value && !force) return;

    loading.value = true;
    // Note: syncError is not cleared immediately if we have data, 
    // to avoid flickering the UI if it's already showing an error.
    // However, if we succeed, we clear it.

    try {
      // Use WakeLock during heavy sync to prevent mobile sleep
      await wakeLock.request();
      
      const remoteData = await fetchRemote({ force });

      // [GUARD] VALIDATION BOUNDARY: Target B [1]
      // Rationale: Ensure that the remote payload matches the expected schema
      // before it enters the application state. Malformed responses from GAS
      // or the Worker must be rejected to prevent silent corruption.
      const validation = v.safeParse(WebAppDataSchema, remoteData);
      if (!validation.success) {
        throw new Error("Remote data validation failed");
      }

      const output = validation.output as WebAppData;
      data.value = output;

      // [FIX] SERVER-AUTHORITATIVE FRESHNESS: Target A [1]
      lastSync.value = new Date(output.timestamp).getTime();
      
      dataSource.value = output.dataSource || null;
      hubTimestamp.value = output.hubTimestamp || null;
      lastCompiled.value = output.lastCompiled || null;
      lastFetched.value = output.lastFetched || null;
      consecutiveSyncFailures.value = 0;
      syncError.value = null; // Clear error on success
      
      // PERSISTENCE: StorageService handles the IndexedDB write
      await saveCache(validation.output as WebAppData);
    } catch (e: unknown) {
      consecutiveSyncFailures.value++;
      
      const errorMessage = e instanceof Error ? e.message : "Sync failed";
      
      // LOGICAL FAULT TOLERANCE:
      // If we already have data (isHydrated), only surfacing the error after 3 consecutive 
      // failures to avoid alarming the user with transient network glitches.
      if (!isHydrated.value || consecutiveSyncFailures.value >= 3) {
        syncError.value = errorMessage;
      }
      
      console.warn(`[Store] Background sync failed (Attempt ${consecutiveSyncFailures.value}):`, e);
    } finally {
      loading.value = false;
      await wakeLock.release();
    }
  }

  /**
   * Manually updates a specific player profile within the store.
   * Useful for immediate feedback after a local edit or a single-player refresh.
   *
   * @remarks
   * Implements a strict validation boundary (Target B [1]) and respects
   * the clinical isolation of the store state by spreading into a new array.
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
      saveCache(updatedData).catch(e => {
        console.error("[Store] Failed to persist player update:", e);
      });
    }
  }

  /**
   * [DIAGNOSTIC] TRIGGER UPDATE
   * Forces the Service Worker to skip-waiting and activate the next version.
   * Logic: Sends 'SKIP_WAITING' to the waiting registration.
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
    hubTimestamp,
    hubDiagnosis,

    // Getters
    members,
    recruits,
    lastUpdated,
    currentSource,
    hubSyncTime,
    lastCompiledTime: computed(() => lastCompiled.value),
    lastFetchedTime: computed(() => lastFetched.value),
    isStale,
    isHydrated,
    isRefreshing,
    lastSyncTime,

    // Actions
    loadLocal,
    updateLocalData,
    startBackgroundSync,
    refresh: () => startBackgroundSync(true),
    refreshWorker,
    updatePlayerLocally
  };
});
