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
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core)
 * - **Role:** Decomposed logic for data synchronization and persistence.
 * - **Satisfaction:** ADR Section I (Core Services). Centralizes sync state and
 *   persistence logic away from the main Pinia store to satisfy SRP.
 *
 * @param data - Reactive reference to the authoritative WebAppData state.
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

  /**
   * Internal helper to update reactive state and persist the result to the local cache.
   *
   * @param payload - The new WebAppData to commit, or null to clear state.
   */
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
        // [THREAT:] Persistence failure can lead to data loss on refresh.
        // [DECISION LOG] We log the error but do not block the UI, as the
        // reactive state is already updated in memory.
        await saveCache(payload);
      }
    } catch (persistenceError: unknown) {
      console.error("[Sync] Commit persistence failed:", persistenceError instanceof Error ? persistenceError.message : String(persistenceError));
    }
  }

  /**
   * Hydrates the service state from the local IndexedDB cache.
   *
   * @remarks
   * Performs Valibot validation on the cached data to ensure schema integrity.
   * If validation fails or no cache exists, state is initialized to null.
   */
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

      // [THREAT:] Corrupt or stale local cache can cause UI crashes.
      // [DECISION LOG] Enforce strict validation boundary via WebAppDataSchema.
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

  /**
   * Manually updates the service state with an external payload.
   *
   * @param payload - Unvalidated data object matching WebAppData schema.
   */
  async function updateLocalData(payload: unknown) {
    // [DECISION LOG] External ingress must be validated before commitment.
    const result = v.safeParse(WebAppDataSchema, payload);
    if (!result.success) {
      console.warn("[Sync] Local update rejected: Invalid WebAppData structure", result.issues);
      return;
    }

    await commitSyncResult(result.output);
  }

  /**
   * Triggers a high-priority foreground synchronization from Supabase.
   *
   * @remarks
   * Utilizes a WakeLock to prevent the device from sleeping during the network request.
   * If the foreground sync fails, it automatically falls back to a background sync attempt.
   */
  async function refreshFromSupabase() {
    // [GUARD] Concurrency: Prevent overlapping sync cycles.
    if (loading.value) return;

    if (isSyntheticMode.value) {
      console.debug("[Sync] Synthetic Mode active: Refreshing mock data");
      await commitSyncResult(generateMockData());
      return;
    }

    if (!isOnline.value) return;

    loading.value = true;
    try {
      // [DECISION LOG] Request WakeLock to ensure sync completes on mobile devices.
      await wakeLock.request();
      const remoteData = await fetchRemote({ force: true });

      // [THREAT:] Malformed remote payload could corrupt local state.
      // [DECISION LOG] Validation boundary protects the in-memory state.
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

  /**
   * Executes a non-blocking background synchronization.
   *
   * @param force - If true, bypasses the online check.
   */
  async function startBackgroundSync(force = false) {
    // [GUARD] Concurrency: Prevent overlapping sync cycles.
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

      // [DECISION LOG] Failure threshold: Only expose sync errors to the user after
      // 3 consecutive failures to avoid noise during transient network drops.
      if (!data.value || consecutiveSyncFailures.value >= 3) {
        syncError.value = errorMessage;
      }

      console.warn(`[Sync] Background sync failed (Attempt ${consecutiveSyncFailures.value}):`, backgroundSyncError);
    } finally {
      loading.value = false;
      await wakeLock.release();
    }
  }

  /**
   * Patches a specific player's data in the local state.
   *
   * @param playerTag - The unique identifier of the player to update.
   * @param partial - The partial player data to merge.
   */
  function updatePlayerLocally(playerTag: PlayerTag, partial: unknown) {
    if (!data.value) return;

    // [DECISION LOG] Partial validation: Ensure the patch adheres to MemberSchema.
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

      // [THREAT:] Persistence failure can lead to local state drift.
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
