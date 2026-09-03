// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";
import * as v from "valibot";
import { useConnectionStatus } from "./useConnectionStatus";
import { fetchRemote, lastSyncStatus } from "../api/SupabaseClient";
import { loadCache, saveCache } from "./StorageService";
import { useSyntheticMode } from "./useSyntheticMode";
import { generateMockData } from "../utils/mockData";
import { yieldToInteractionFrame } from "../utils/scheduling";
import { MemberSchema } from "../api/MemberSchemas";
import { WebAppDataSchema } from "../api/AppSchemas";
import type { WebAppData } from "../types";

const SYNC_REQUEST_TIMEOUT_MS = 15000;
const SYNC_FAILURE_VISIBILITY_THRESHOLD = 3;

type SyncIntent = "background" | "manual";

type SyncAttemptResult =
  | { success: true }
  | { success: false; error: Error; failureCount: number };

/**
 * CLASH SYNC SERVICE (Layer 1)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core).
 * - **Role:** Decomposed logic for data synchronization and persistence.
 * - **Satisfaction:** ADR Section I (Core Services). Centralizes sync state and
 *   persistence logic away from the main Pinia store to satisfy SRP.
 *
 * @param data - Reactive reference to the authoritative WebAppData state.
 *
 * @returns
 * - `loading`: Reactive flag to prevent concurrent synchronization cycles.
 * - `lastSync`: Unix timestamp (ms) representing the authoritative age of the local data.
 * - `syncError`: Stores the most recent sync error message.
 * - `dataSource`: Indicates the provenance of the dataset (SUPABASE).
 * - `remoteTimestamp`: Authoritative timestamp from the last successful Supabase fetch.
 * - `syncStatus`: Authoritative diagnosis state from the last Supabase sync attempt.
 * - `lastCompiled`: Server-side compilation marker.
 * - `lastFetched`: Raw API fetch marker.
 * - `loadLocal`: Hydrates the service state from the local IndexedDB cache.
 * - `updateLocalData`: Manually updates the service state with an external payload.
 * - `refreshFromSupabase`: Triggers a high-priority foreground synchronization from Supabase.
 * - `startBackgroundSync`: Executes a non-blocking background synchronization.
 * - `updatePlayerLocally`: Patches a specific player's data in the local state.
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

  /** The single authoritative in-flight remote synchronization attempt. */
  let activeSyncPromise: Promise<SyncAttemptResult> | null = null;

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

  // --- ACTIONS ---

  /**
   * Initializes a default, empty WebAppData state object.
   *
   * @returns An empty WebAppData DTO matching structural schema constraints.
   */
  function createEmptyWebAppData(): WebAppData {
    return {
      lb: [],
      hh: [],
      timestamp: 0,
      blacklist: [],
    };
  }

  /**
   * Fetches remote data from Supabase bounded by an explicit request timeout.
   *
   * @remarks
   * Satisfies ADR Section I (Core Services) network resilience guidelines.
   *
   * @param options - Transport parameters including force refresh flag.
   * @returns Unvalidated raw payload resolved from Supabase fetch.
   * @throws Error if network request fails or exceeds SYNC_REQUEST_TIMEOUT_MS.
   */
  async function fetchRemoteWithTimeout(options: { force: boolean }): Promise<unknown> {
    const requestController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      // [THREAT:] Unbounded network requests can cause UI hanging or memory leaks.
      // [DECISION LOG] Race network fetch against a SYNC_REQUEST_TIMEOUT_MS timeout timer
      // and explicitly signal cancellation via AbortController on timeout trigger.
      return await Promise.race([
        fetchRemote({ ...options, signal: requestController.signal }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            const timeoutError = new Error("Sync timed out");
            reject(timeoutError);
            requestController.abort(timeoutError);
          }, SYNC_REQUEST_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Internal helper to update reactive state and persist the result to the local cache.
   *
   * @param webAppDataSnapshot - The new WebAppData to commit, or null to clear state.
   * @param commitOptions - Provenance of this commit.
   * @param commitOptions.skipSave - If true, bypasses saving to the persistent cache.
   * @param commitOptions.remoteSuccess - If true, this commit is the product of a
   *   COMPLETED sync attempt and is therefore evidence the data source is reachable.
   *   Defaults to false so a new call site cannot claim remote health by omission.
   */
  async function commitSyncResult(
    webAppDataSnapshot: WebAppData | null,
    commitOptions: { skipSave?: boolean; remoteSuccess?: boolean } = {},
  ) {
    const { skipSave = false, remoteSuccess = false } = commitOptions;
    data.value = webAppDataSnapshot;

    if (webAppDataSnapshot) {
      lastSync.value = webAppDataSnapshot.timestamp;
      dataSource.value = webAppDataSnapshot.dataSource || null;
      remoteTimestamp.value = webAppDataSnapshot.remoteTimestamp || null;
      lastCompiled.value = webAppDataSnapshot.lastCompiled || null;
      lastFetched.value = webAppDataSnapshot.lastFetched || null;
    } else {
      lastSync.value = 0;
      dataSource.value = null;
      remoteTimestamp.value = null;
      lastCompiled.value = null;
      lastFetched.value = null;
    }

    // [THREAT:] This is the shared commit path for remote syncs AND for purely
    // local mutations (updateLocalData, reached from injectRecruits,
    // applyLocalDismissal and both dismissal rollbacks). Clearing the remote
    // failure state unconditionally meant a local edit forged proof of backend
    // health.
    //
    // The worst case is a rollback. When dismissRecruits() rejects because the
    // backend is unreachable, useHeadhunter restores the previous state with
    // updateLocalData(oldData) - so the very handler that proved the backend
    // was down wiped syncError and restarted the
    // SYNC_FAILURE_VISIBILITY_THRESHOLD window from zero, suppressing the next
    // two background failures as well.
    //
    // [DECISION LOG] Only a completed sync attempt is evidence about the data
    // source. A local commit leaves consecutiveSyncFailures and syncError
    // exactly as the last real sync left them.
    if (remoteSuccess) {
      consecutiveSyncFailures.value = 0;
      syncError.value = null;
    }

    if (skipSave) return;

    try {
      if (webAppDataSnapshot) {
        // [THREAT:] Persistence failure can lead to data loss on refresh.
        // [DECISION LOG] We log the error but do not block the UI, as the
        // reactive state is already updated in memory.
        await saveCache(webAppDataSnapshot);
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
        await commitSyncResult(generateMockData(), { remoteSuccess: true });
        return;
      }

      const cachedWebAppData = await loadCache();

      if (!cachedWebAppData) {
        console.debug("[Sync] No local cache found, starting fresh.");
        await commitSyncResult(createEmptyWebAppData(), { skipSave: true });
        return;
      }

      // [THREAT:] Corrupt or stale local cache can cause UI crashes.
      // [DECISION LOG] Enforce strict validation boundary via WebAppDataSchema.
      const webAppDataValidation = v.safeParse(WebAppDataSchema, cachedWebAppData);
      if (webAppDataValidation.success) {
        if (data.value && data.value.timestamp >= webAppDataValidation.output.timestamp) {
          console.debug("[Sync] Local cache is older than already hydrated live data, skipping.");
          return;
        }
        console.debug("[Sync] Local cache hydrated successfully.");
        await commitSyncResult(webAppDataValidation.output, { skipSave: true });
      } else {
        console.warn("[Sync] Local cache validation failed:", webAppDataValidation.issues);
        if (!data.value) await commitSyncResult(createEmptyWebAppData(), { skipSave: true });
      }
    } catch (hydrationError: unknown) {
      console.error("[Sync] Cache hydration failed:", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
      await commitSyncResult(createEmptyWebAppData(), { skipSave: true });
    }
  }

  /**
   * Manually updates the service state with an external payload.
   *
   * @param webAppDataSnapshot - Unvalidated data object matching WebAppData schema.
   */
  async function updateLocalData(webAppDataSnapshot: unknown) {
    // [DECISION LOG] External ingress must be validated before commitment.
    const incomingDataValidation = v.safeParse(WebAppDataSchema, webAppDataSnapshot);
    if (!incomingDataValidation.success) {
      console.warn("[Sync] Local update rejected: Invalid WebAppData structure", incomingDataValidation.issues);
      return;
    }

    await commitSyncResult(incomingDataValidation.output);
  }

  /**
   * Safely coercively normalizes unknown sync thrown errors to Error instances.
   *
   * @param syncFailure - Raw caught error or rejection reason.
   * @returns Normalized Error object.
   */
  function normalizeSyncError(syncFailure: unknown): Error {
    return syncFailure instanceof Error ? syncFailure : new Error("Sync failed");
  }

  /**
   * Runs or joins the single authoritative remote synchronization attempt.
   *
   * @remarks
   * Satisfies ADR Section I: Core Services & Section III: Validation Boundaries.
   * Transport, validation, and persistence are intentionally centralized here.
   *
   * @param force - If true, requests cache bypass at the Supabase transport layer.
   * @returns Bounded result indicating execution success or normalized error context.
   */
  function executeRemoteSync(force: boolean): Promise<SyncAttemptResult> {
    // [DECISION LOG] Single-Flight Promise Lock: Deduplicate concurrent sync calls.
    // Re-use active in-flight sync promise if execution is already underway to eliminate
    // duplicate network requests and race conditions on reactive state commitment.
    if (activeSyncPromise) return activeSyncPromise;
    if (loading.value) {
      return Promise.resolve({
        success: false,
        error: new Error("Sync already in progress"),
        failureCount: consecutiveSyncFailures.value,
      });
    }

    const syncPromise = (async (): Promise<SyncAttemptResult> => {
      loading.value = true;
      try {
        const remoteData = await fetchRemoteWithTimeout({ force });
        const remoteDataValidation = v.safeParse(WebAppDataSchema, remoteData);

        if (!remoteDataValidation.success) {
          console.error("[Sync] Data Validation Failure Details:", JSON.stringify(remoteDataValidation.issues, null, 2));
          throw new Error("Remote data validation failed");
        }

        await yieldToInteractionFrame();
        await commitSyncResult(remoteDataValidation.output, { remoteSuccess: true });
        return { success: true };
      } catch (syncFailure: unknown) {
        consecutiveSyncFailures.value++;
        const normalizedSyncError = normalizeSyncError(syncFailure);
        console.warn(`[Sync] Remote sync failed (Attempt ${consecutiveSyncFailures.value}):`, normalizedSyncError);
        return {
          success: false,
          error: normalizedSyncError,
          failureCount: consecutiveSyncFailures.value,
        };
      } finally {
        loading.value = false;
      }
    })();

    activeSyncPromise = syncPromise;
    void syncPromise.finally(() => {
      if (activeSyncPromise === syncPromise) activeSyncPromise = null;
    });
    return syncPromise;
  }

  /**
   * Applies caller intent to the sync attempt without duplicating sync execution.
   *
   * @param syncIntent - Intent type ("background" or "manual").
   * @param force - If true, forces remote transport cache bypass.
   */
  async function runSync(syncIntent: SyncIntent, force: boolean): Promise<void> {
    if (isSyntheticMode.value) {
      console.debug("[Sync] Synthetic Mode active: Refreshing mock data");
      await commitSyncResult(generateMockData(), { remoteSuccess: true });
      return;
    }

    if (syncIntent === "background" && !isOnline.value && !force) return;

    const syncResult = await executeRemoteSync(force);
    if (syncResult.success) return;

    // [DECISION LOG] Fault Visibility Thresholding: Suppress transient background sync
    // errors until consecutive failure count meets SYNC_FAILURE_VISIBILITY_THRESHOLD (3)
    // to avoid user notification noise, while immediately exposing manual or unhydrated errors.
    const shouldExposeFailure = syncIntent === "manual"
      || !data.value
      || syncResult.failureCount >= SYNC_FAILURE_VISIBILITY_THRESHOLD;

    if (shouldExposeFailure) syncError.value = syncResult.error.message;
  }

  /** Triggers a user-visible foreground synchronization from Supabase. */
  async function refreshFromSupabase(): Promise<void> {
    await runSync("manual", true);
  }

  /**
   * Executes a fault-tolerant background synchronization.
   *
   * @param force - If true, bypasses the online check.
   */
  async function startBackgroundSync(force = false): Promise<void> {
    await runSync("background", force);
  }

  /**
   * Patches a specific player's data in the local state.
   *
   * @param playerTag - The unique identifier of the player to update.
   * @param playerPartialUpdate - The partial player data to merge.
   */
  function updatePlayerLocally(playerTag: string, playerPartialUpdate: unknown) {
    if (!data.value) return;

    // [DECISION LOG] Partial validation: Ensure the patch adheres to MemberSchema.
    const partialUpdateValidation = v.safeParse(v.partial(MemberSchema), playerPartialUpdate);
    if (!partialUpdateValidation.success) {
      console.warn("[Sync] Local update rejected: Invalid partial data", partialUpdateValidation.issues);
      return;
    }

    const memberIndex = data.value.lb.findIndex(member => member.id === playerTag);

    if (memberIndex !== -1) {
      const leaderboardSnapshot = [...data.value.lb];
      leaderboardSnapshot[memberIndex] = {
        ...leaderboardSnapshot[memberIndex],
        ...partialUpdateValidation.output
      };

      const updatedData = {
        ...data.value,
        lb: leaderboardSnapshot
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
