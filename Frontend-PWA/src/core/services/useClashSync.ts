// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";
import * as v from "valibot";
import { useConnectionStatus } from "./useConnectionStatus";
import { useWakeLock } from "./useWakeLock";
import { fetchRemote, lastSyncStatus } from "../api/SupabaseClient";
import { loadCache, saveCache } from "./StorageService";
import { useSyntheticMode } from "./useSyntheticMode";
import { generateMockData } from "../utils/mockData";
import { MemberSchema } from "../api/MemberSchemas";
import { WebAppDataSchema } from "../api/AppSchemas";
import type { WebAppData, PlayerTag } from "../types";

/**
 * CLASH SYNC SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Decomposed logic for data synchronization and persistence.
 * ----------------------------------------------------------------------------
 */
export function useClashSync(data: Ref<WebAppData | null>) {
  // --- STATE ---

  /** Reactive flag to prevent concurrent synchronization cycles. */
  const loading = ref(false);

  /** Unix timestamp (ms) representing the authoritative age of the local data. */
  const lastSync = ref<number>(0);

  /** Stores the most recent sync error message. */
  const syncError = ref<string | null>(null);

  /** Fault tolerance tracker for user-visible errors. */
  const consecutiveSyncFailures = ref(0);

  /** Indicates the provenance of the dataset (SUPABASE). */
  const dataSource = ref<"SUPABASE" | null>(null);

  /** Authoritative diagnosis state from the last Supabase sync attempt. */
  const syncStatus = lastSyncStatus;

  /** Authoritative timestamp from the last successful Supabase fetch. */
  const remoteTimestamp = ref<number | null>(null);

  /** Server-side compilation marker. */
  const lastCompiled = ref<number | null>(null);

  /** Raw API fetch marker. */
  const lastFetched = ref<number | null>(null);

  // --- DEPENDENCIES ---
  const { isSyntheticMode } = useSyntheticMode();
  const { isOnline } = useConnectionStatus();
  const wakeLock = useWakeLock();

  // --- ACTIONS ---

  async function commitSyncResult(payload: WebAppData | null) {
    data.value = payload;

    if (payload) {
      lastSync.value = payload.timestamp;
      dataSource.value = payload.dataSource || null;
      remoteTimestamp.value = payload.remoteTimestamp || null;
      lastCompiled.value = payload.lastCompiled || null;
      lastFetched.value = payload.lastFetched || null;
    } else {
      lastSync.value = 0;
      dataSource.value = null;
      remoteTimestamp.value = null;
      lastCompiled.value = null;
      lastFetched.value = null;
    }

    consecutiveSyncFailures.value = 0;
    syncError.value = null;

    try {
      if (payload) {
        await saveCache(payload);
      }
    } catch (persistenceError: unknown) {
      console.error("[Sync] Commit persistence failed:", persistenceError instanceof Error ? persistenceError.message : String(persistenceError));
    }
  }

  async function loadLocal() {
    try {
      if (isSyntheticMode.value) {
        console.debug("[Sync] Synthetic Mode active: Seeding initial mock data");
        await commitSyncResult(generateMockData());
        return;
      }

      const cached = await loadCache();

      if (!cached) {
        console.debug("[Sync] No local cache found, starting fresh.");
        await commitSyncResult(null);
        return;
      }

      const validation = v.safeParse(WebAppDataSchema, cached);
      if (validation.success) {
        if (data.value && data.value.timestamp >= validation.output.timestamp) {
          console.debug("[Sync] Local cache is older than already hydrated live data, skipping.");
          return;
        }
        console.debug("[Sync] Local cache hydrated successfully.");
        await commitSyncResult(validation.output);
      } else {
        console.warn("[Sync] Local cache validation failed:", validation.issues);
        if (!data.value) await commitSyncResult(null);
      }
    } catch (hydrationError: unknown) {
      console.error("[Sync] Cache hydration failed:", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
      await commitSyncResult(null);
    }
  }

  async function updateLocalData(payload: unknown) {
    const result = v.safeParse(WebAppDataSchema, payload);
    if (!result.success) {
      console.warn("[Sync] Local update rejected: Invalid WebAppData structure", result.issues);
      return;
    }

    await commitSyncResult(result.output);
  }

  async function refreshFromSupabase() {
    if (loading.value) return;

    if (isSyntheticMode.value) {
      console.debug("[Sync] Synthetic Mode active: Refreshing mock data");
      await commitSyncResult(generateMockData());
      return;
    }

    if (!isOnline.value) return;

    loading.value = true;
    try {
      await wakeLock.request();
      const remoteData = await fetchRemote({ force: true });

      const result = v.safeParse(WebAppDataSchema, remoteData);
      if (!result.success) {
        console.error("[Sync] Data Validation Failure Details:", JSON.stringify(result.issues, null, 2));
        throw new Error("Remote data validation failed");
      }

      console.debug(`[Sync] Refresh successful. Source: ${result.output.dataSource}`);
      await commitSyncResult(result.output);
    } catch (supabaseRefreshError: unknown) {
      console.warn("[Sync] Supabase refresh failed:", supabaseRefreshError);

      loading.value = false;
      await wakeLock.release();

      return startBackgroundSync(true);
    } finally {
      if (loading.value) {
        loading.value = false;
        await wakeLock.release();
      }
    }
  }

  async function startBackgroundSync(force = false) {
    if (loading.value) return;
    if (!isOnline.value && !force) return;

    loading.value = true;

    try {
      await wakeLock.request();
      const remoteData = await fetchRemote({ force });

      const result = v.safeParse(WebAppDataSchema, remoteData);
      if (!result.success) {
        throw new Error("Remote data validation failed");
      }

      await commitSyncResult(result.output);
    } catch (backgroundSyncError: unknown) {
      consecutiveSyncFailures.value++;
      const errorMessage = backgroundSyncError instanceof Error ? backgroundSyncError.message : "Sync failed";

      if (!data.value || consecutiveSyncFailures.value >= 3) {
        syncError.value = errorMessage;
      }

      console.warn(`[Sync] Background sync failed (Attempt ${consecutiveSyncFailures.value}):`, backgroundSyncError);
    } finally {
      loading.value = false;
      await wakeLock.release();
    }
  }

  function updatePlayerLocally(playerTag: PlayerTag, partial: unknown) {
    if (!data.value) return;

    const validation = v.safeParse(v.partial(MemberSchema), partial);
    if (!validation.success) {
      console.warn("[Sync] Local update rejected: Invalid partial data", validation.issues);
      return;
    }

    const memberIndex = data.value.lb.findIndex(member => member.id === playerTag);

    if (memberIndex !== -1) {
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

      saveCache(updatedData).catch(persistenceError => {
        console.error("[Sync] Failed to persist player update:", persistenceError);
      });
    }
  }

  return {
    loading,
    lastSync,
    syncError,
    dataSource,
    remoteTimestamp,
    syncStatus,
    lastCompiled,
    lastFetched,
    loadLocal,
    updateLocalData,
    refreshFromSupabase,
    startBackgroundSync,
    updatePlayerLocally
  };
}
