// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useConnectionStatus } from "./useConnectionStatus";
import { useWakeLock } from "./useWakeLock";
import { fetchRemote } from "../api/GasClient";
import { loadCache, saveCache } from "./StorageService";
import { useBlueprintMode } from "./useBlueprintMode";
import { MemberSchema } from "../api/DataSchemas";
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

  // --- DEPENDENCIES ---
  const { isOnline } = useConnectionStatus();
  const wakeLock = useWakeLock();
  const blueprint = useBlueprintMode();

  // --- GETTERS ---
  const members = computed(() => data.value?.lb || []);
  const recruits = computed(() => data.value?.hh || []);
  const lastUpdated = computed(() => data.value?.timestamp || "");

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
      if (cached) {
        data.value = cached;
        lastSync.value = Date.now();
      }
    } catch (e) {
      console.error("[Store] Cache hydration failed:", e);
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
    syncError.value = null;

    try {
      // Use WakeLock during heavy sync to prevent mobile sleep
      await wakeLock.request();
      
      const remoteData = await fetchRemote({ force });
      data.value = remoteData;
      lastSync.value = Date.now();
      
      // PERSISTENCE: StorageService handles the IndexedDB write
      await saveCache(remoteData);
    } catch (e: any) {
      syncError.value = e.message || "Sync failed";
      console.warn("[Store] Background sync failed:", e);
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
      } as any;

      data.value = {
        ...data.value,
        lb: newLb
      };
    }
  }

  return {
    // State
    data,
    loading,
    lastSync,
    syncError,

    // Getters
    members,
    recruits,
    lastUpdated,
    isStale,
    isHydrated,
    isRefreshing,
    lastSyncTime,

    // Actions
    loadLocal,
    startBackgroundSync,
    updatePlayerLocally
  };
});
