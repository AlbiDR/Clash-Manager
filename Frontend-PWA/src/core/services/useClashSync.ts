// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import * as v from "valibot";
import { useConnectionStatus } from "./useConnectionStatus";
import { useApiState } from "../api/useApiState";
import { lastSyncStatus } from "../api/SupabaseClient";
import { loadCache, saveCache } from "./StorageService";
import { useSyntheticMode } from "./useSyntheticMode";
import { generateMockData } from "../utils/mockData";
import { yieldToInteractionFrame } from "../utils/scheduling";
import { getRetryDelayMs } from "../api/SupabaseTransport";
import { usePowerSaving } from "./usePowerSaving";
import { MemberSchema } from "../api/MemberSchemas";
import { WebAppDataSchema } from "../api/AppSchemas";
import { cleanTag } from "../utils/text";
import type { WebAppData } from "../types";
import {
  classifySyncFailure,
  createEmptyWebAppData,
  describeSyncFailure,
  fetchRemoteWithTimeout,
  getBackgroundBackoffSpan,
  normalizeSyncError,
} from "./useClashSyncUtils";

const SYNC_FAILURE_VISIBILITY_THRESHOLD = 3;

type SyncIntent = "background" | "manual";

type SyncAttemptResult =
  | { success: true }
  | { success: false; error: Error; failureCount: number };

type SnapshotFreshnessKey = "rosterSnapshotRefreshedAt" | "headhunterSnapshotRefreshedAt";

/**
 * Extracts a verified positive numeric freshness timestamp from a WebAppData snapshot key.
 *
 * @param dataSnapshot - The WebAppData snapshot object.
 * @param key - Specific snapshot freshness property key.
 * @returns Positive numeric timestamp or null if invalid/missing.
 */
function getSnapshotFreshnessTimestamp(dataSnapshot: WebAppData, key: SnapshotFreshnessKey): number | null {
  const timestamp = dataSnapshot[key];
  return typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? timestamp
    : null;
}

/**
 * Computes conservative publication timestamp across all active Supabase snapshot streams.
 *
 * @remarks
 * [DECISION LOG] Freshness is conservative across all sub-domains: the combined timestamp
 * is the minimum of both roster and headhunter snapshot times to prevent premature staleness clearance.
 *
 * @param dataSnapshot - The WebAppData snapshot object.
 * @returns Minimum snapshot timestamp or zero if unknown or non-Supabase source.
 */
function getCombinedSnapshotTimestamp(dataSnapshot: WebAppData): number {
  if (dataSnapshot.dataSource !== "SUPABASE") return dataSnapshot.timestamp;
  const rosterTimestamp = getSnapshotFreshnessTimestamp(dataSnapshot, "rosterSnapshotRefreshedAt");
  const headhunterTimestamp = getSnapshotFreshnessTimestamp(dataSnapshot, "headhunterSnapshotRefreshedAt");
  return rosterTimestamp !== null && headhunterTimestamp !== null
    ? Math.min(rosterTimestamp, headhunterTimestamp)
    : 0;
}

/**
 * Normalizes legacy compilation markers into authoritative snapshot freshness timestamps.
 *
 * @param dataSnapshot - The incoming WebAppData snapshot object.
 * @returns Normalized WebAppData object with legacy properties stripped and timestamp synchronized.
 */
function normalizeSnapshotFreshness(dataSnapshot: WebAppData): WebAppData {
  if (dataSnapshot.dataSource !== "SUPABASE") return dataSnapshot;
  const timestamp = getCombinedSnapshotTimestamp(dataSnapshot);
  const {
    remoteTimestamp: _legacyRemoteTimestamp,
    lastCompiled: _legacyLastCompiled,
    ...snapshotWithoutLegacyFreshness
  } = dataSnapshot;
  return {
    ...snapshotWithoutLegacyFreshness,
    timestamp,
    ...(timestamp > 0 ? { remoteTimestamp: timestamp } : {}),
  };
}

/**
 * Reconciles incoming remote snapshot data against current local state, preserving newer sub-domain snapshots.
 *
 * @remarks
 * [THREAT:] Replica lag or delayed transport responses can return stale sub-domain snapshots.
 * Reconciling roster and headhunter sub-domains independently prevents state regressions.
 *
 * @param currentData - Active in-memory WebAppData state.
 * @param incomingData - Freshly fetched or cached WebAppData payload.
 * @param acceptUnknownIncoming - Whether to accept incoming data when its timestamp is unknown/null.
 * @returns Reconciled WebAppData object combining the newest roster and headhunter snapshots.
 */
function preserveNewerSnapshotData(
  currentData: WebAppData,
  incomingData: WebAppData,
  acceptUnknownIncoming = false,
): WebAppData {
  if (currentData.dataSource !== "SUPABASE" && incomingData.dataSource === "SUPABASE") {
    return incomingData;
  }
  if (currentData.dataSource !== "SUPABASE" || incomingData.dataSource !== "SUPABASE") {
    return incomingData.timestamp < currentData.timestamp
      ? { ...currentData, lastFetched: incomingData.lastFetched ?? Date.now() }
      : incomingData;
  }

  const preserveRoster = (() => {
    const currentTimestamp = getSnapshotFreshnessTimestamp(currentData, "rosterSnapshotRefreshedAt");
    const incomingTimestamp = getSnapshotFreshnessTimestamp(incomingData, "rosterSnapshotRefreshedAt");
    return currentTimestamp !== null && (incomingTimestamp !== null
      ? incomingTimestamp < currentTimestamp
      : !acceptUnknownIncoming);
  })();
  const preserveHeadhunter = (() => {
    const currentTimestamp = getSnapshotFreshnessTimestamp(currentData, "headhunterSnapshotRefreshedAt");
    const incomingTimestamp = getSnapshotFreshnessTimestamp(incomingData, "headhunterSnapshotRefreshedAt");
    return currentTimestamp !== null && (incomingTimestamp !== null
      ? incomingTimestamp < currentTimestamp
      : !acceptUnknownIncoming);
  })();

  if (!preserveRoster && !preserveHeadhunter) return incomingData;

  const incomingBlacklist = new Set((incomingData.blacklist ?? []).map(cleanTag));
  const preservedHeadhunter = preserveHeadhunter
    ? currentData.hh.filter((recruit) => !incomingBlacklist.has(cleanTag(recruit.id)))
    : undefined;

  const mergedData: WebAppData = {
    ...incomingData,
    ...(preserveRoster && {
      lb: currentData.lb,
      rosterSnapshotRefreshedAt: currentData.rosterSnapshotRefreshedAt,
    }),
    ...(preserveHeadhunter && {
      hh: preservedHeadhunter,
      headhunterSnapshotRefreshedAt: currentData.headhunterSnapshotRefreshedAt,
    }),
  };
  const timestamp = getCombinedSnapshotTimestamp(mergedData);
  return { ...mergedData, timestamp, remoteTimestamp: timestamp };
}

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
 * - `lastSync`: Conservative publication time across both Supabase snapshots, or zero when unknown.
 * - `syncError`: Stores the most recent sync error message.
 * - `dataSource`: Indicates the provenance of the dataset (SUPABASE).
 * - `remoteTimestamp`: Conservative publication time from the remote snapshots.
 * - `syncStatus`: Authoritative diagnosis state from the last Supabase sync attempt.
 * - `lastCompiled`: Legacy server marker from older cached records, cleared for Supabase data.
 * - `lastFetched`: Raw API fetch marker.
 * - `loadLocal`: Hydrates the service state from the local IndexedDB cache.
 * - `updateLocalData`: Manually updates the service state with an external payload.
 * - `refreshFromSupabase`: Triggers a high-priority foreground synchronization from Supabase.
 * - `refreshAfterInvalidation`: Refreshes after server invalidation, coalescing concurrent listeners.
 * - `startBackgroundSync`: Executes a non-blocking background synchronization.
 * - `updatePlayerLocally`: Patches a specific player's data in the local state.
 */
export function useClashSync(data: Ref<WebAppData | null>) {
  // --- STATE ---

  /** Reactive flag to prevent concurrent synchronization cycles. */
  const loading = ref(false);

  /** Conservative publication time across both Supabase snapshots, or zero when unknown. */
  const lastSync = ref<number>(0);

  /** Stores the most recent sync error message. */
  const syncError = ref<string | null>(null);

  /** Fault tolerance tracker for user-visible errors. */
  const consecutiveSyncFailures = ref(0);

  /** Background sync requests declined since the last attempt, while backing off. */
  let declinedBackgroundSyncs = 0;

  /** Set when the backend comes back online during a backoff; lets the next background request through. */
  let backoffWaived = false;

  /** The single authoritative in-flight remote synchronization attempt. */
  let activeSyncPromise: Promise<SyncAttemptResult> | null = null;

  /** Cancellation authority for the active remote transport. */
  let activeSyncController: AbortController | null = null;

  /** One invalidation refresh queued behind the current pass, if any. */
  let queuedInvalidationPromise: Promise<SyncAttemptResult> | null = null;

  /** Coalesces synchronous listeners notified by the same server event. */
  let invalidationBatchPromise: Promise<void> | null = null;

  /** One automatic foreground recovery attempt after a transient timeout. */
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  let recoveryAttempted = false;
  let disposed = false;

  /** Indicates the provenance of the dataset (SUPABASE). */
  const dataSource = ref<"SUPABASE" | null>(null);

  /** Authoritative diagnosis state from the last Supabase sync attempt. */
  const syncStatus = lastSyncStatus;

  /** Conservative publication time from both remote snapshots, or null when unknown. */
  const remoteTimestamp = ref<number | null>(null);

  /** Legacy server compilation marker, absent from current per-snapshot payloads. */
  const lastCompiled = ref<number | null>(null);

  /** Raw API fetch marker. */
  const lastFetched = ref<number | null>(null);

  // --- DEPENDENCIES ---
  const { isSyntheticMode } = useSyntheticMode();
  const { isOnline } = useConnectionStatus();
  const { apiStatus } = useApiState();
  const { isPowerSaving } = usePowerSaving();

  /** Clears any active foreground recovery timer. */
  function clearRecoveryTimer() {
    if (recoveryTimer !== null) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  }

  /**
   * Triggers immediate background sync recovery when connection or visibility is restored following a failure.
   *
   * @remarks
   * [DECISION LOG] Healthy short app switches retain normal freshness thresholds;
   * a failed read needs one immediate recovery attempt on foreground/reconnect transition.
   */
  function handleConnectionRecovery() {
    if (
      disposed
      || !isOnline.value
      || typeof document === "undefined"
      || document.visibilityState !== "visible"
      || consecutiveSyncFailures.value === 0
      || (lastSyncStatus.value !== "TIMEOUT" && lastSyncStatus.value !== "OFFLINE")
    ) return;

    clearRecoveryTimer();
    recoveryAttempted = true;
    void startBackgroundSync(true);
  }

  const visibilityDocument = typeof document !== "undefined" ? document : null;
  let previousVisibility = visibilityDocument?.visibilityState;

  /**
   * Monitors document visibility transitions to invoke recovery when returning from hidden state.
   */
  function handleVisibilityRecovery() {
    const visibility = visibilityDocument?.visibilityState;
    const returnedToForeground = visibility === "visible" && previousVisibility === "hidden";
    previousVisibility = visibility;
    if (returnedToForeground) handleConnectionRecovery();
  }
  visibilityDocument?.addEventListener?.("visibilitychange", handleVisibilityRecovery);

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      clearRecoveryTimer();
      visibilityDocument?.removeEventListener?.("visibilitychange", handleVisibilityRecovery);
    });
  }

  /**
   * Assesses whether the application environment is currently eligible for foreground recovery.
   *
   * @returns Boolean indicating foreground recovery eligibility.
   */
  function canRecoverInForeground(): boolean {
    return !disposed
      && isOnline.value
      && !isPowerSaving.value
      && typeof document !== "undefined"
      && document.visibilityState === "visible";
  }

  /**
   * Schedules an automatic backoff recovery timer following a transient read timeout.
   *
   * @remarks
   * [THREAT:] Immediate retries on database statement timeouts exacerbate server load under DB pressure.
   * Statement timeouts (57014) bypass automatic retry scheduling to prevent cascading load.
   *
   * @param error - The transport or server error raised during sync.
   */
  function scheduleTimeoutRecovery(error: Error) {
    // A server statement timeout is evidence of DB pressure, not a transient
    // client deadline; immediately repeating the complete read set would add load.
    if (
      recoveryAttempted
      || recoveryTimer !== null
      || lastSyncStatus.value !== "TIMEOUT"
      || /statement timeout|57014/i.test(error.message)
      || !canRecoverInForeground()
    ) return;

    recoveryAttempted = true;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (!canRecoverInForeground()) return;
      void startBackgroundSync(true);
    }, getRetryDelayMs(0));
  }

  // [DECISION LOG] RECOVERY IS AN EVENT, NOT A POLL: the handshake reaching
  // "online" after it was not is evidence the backend answers again, so the
  // recovery sync fired on that transition must not wait out the backoff span.
  // flush: "sync" sets the waiver before any pre-flush watcher, the recovery
  // trigger among them, can request that sync.
  watch(apiStatus, (status, previousStatus) => {
    if (status === "online" && previousStatus !== "online" && consecutiveSyncFailures.value > 0) {
      backoffWaived = true;
    }
  }, { flush: "sync" });

  // A physical disconnect invalidates the active transport immediately. This
  // releases the single-flight lock promptly and lets the first reconnect
  // refresh establish a new request instead of joining a doomed old one.
  watch(isOnline, (online) => {
    if (!online && activeSyncController && !activeSyncController.signal.aborted) {
      activeSyncController.abort(new Error("Network connection lost"));
    }
    if (online) handleConnectionRecovery();
  });

  // --- ACTIONS ---

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

    // A reachable backend can still return an older snapshot during replica
    // lag, rollback, or a delayed request. Preserve each dataset independently
    // while retaining the new client-fetch timestamp as evidence of connectivity.
    if (
      remoteSuccess
      && webAppDataSnapshot
      && data.value
    ) {
      const reconciledData = preserveNewerSnapshotData(data.value, webAppDataSnapshot, remoteSuccess);
      if (reconciledData !== webAppDataSnapshot) {
        console.warn("[Sync] Preserved snapshot data with newer or verified publication evidence.");
      }
      webAppDataSnapshot = reconciledData;
    }

    if (webAppDataSnapshot) webAppDataSnapshot = normalizeSnapshotFreshness(webAppDataSnapshot);
    data.value = webAppDataSnapshot;

    if (webAppDataSnapshot) {
      lastSync.value = getCombinedSnapshotTimestamp(webAppDataSnapshot);
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
      recoveryAttempted = false;
      clearRecoveryTimer();
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
        const validatedCachedData = normalizeSnapshotFreshness({
          ...webAppDataValidation.output,
          dataSource: typeof cachedWebAppData === "object"
            && cachedWebAppData !== null
            && "dataSource" in cachedWebAppData
            && cachedWebAppData.dataSource === "SUPABASE"
            ? "SUPABASE"
            : webAppDataValidation.output.dataSource,
        });
        console.debug("[Sync] Local cache hydrated successfully.");
        const cacheOrLiveData = data.value
          ? preserveNewerSnapshotData(data.value, validatedCachedData)
          : validatedCachedData;
        await commitSyncResult(cacheOrLiveData, { skipSave: true });
      } else {
        console.warn("[Sync] Local cache validation failed:", webAppDataValidation.issues);
        if (!data.value) await commitSyncResult(createEmptyWebAppData(), { skipSave: true });
      }
    } catch (hydrationError: unknown) {
      console.error("[Sync] Cache hydration failed:", hydrationError instanceof Error ? hydrationError.message : String(hydrationError));
      // A cache failure can race a successful remote refresh when multiple route
      // loaders are active. Never let the lower-authority cache path erase live
      // data that arrived while IndexedDB was still settling.
      if (!data.value) {
        await commitSyncResult(createEmptyWebAppData(), { skipSave: true });
      }
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
   * Runs or joins the single authoritative remote synchronization attempt.
   *
   * @remarks
   * Satisfies ADR Section I: Core Services & Section III: Validation Boundaries.
   * Transport, validation, and persistence are intentionally centralized here.
   *
   * @param force - If true, requests cache bypass at the Supabase transport layer.
   * @returns Bounded result indicating execution success or normalized error context.
   */
  function executeRemoteSync(force: boolean, queueInvalidation = false): Promise<SyncAttemptResult> {
    // [DECISION LOG] Single-Flight Promise Lock: Deduplicate concurrent sync calls.
    // Re-use active in-flight sync promise if execution is already underway to eliminate
    // duplicate network requests and race conditions on reactive state commitment.
    if (activeSyncPromise) {
      if (queueInvalidation) {
        if (queuedInvalidationPromise) return queuedInvalidationPromise;

        const activePromise = activeSyncPromise;
        const invalidationPromise = activePromise.then(() => {
          // Release the queue slot before starting this pass. An invalidation
          // during the follow-up then queues its own subsequent pass.
          queuedInvalidationPromise = null;
          return executeRemoteSync(force, queueInvalidation);
        });
        queuedInvalidationPromise = invalidationPromise;
        return invalidationPromise;
      }
      if (activeSyncController?.signal.aborted) {
        return activeSyncPromise.then(() => executeRemoteSync(force));
      }
      return activeSyncPromise;
    }
    if (loading.value) {
      return Promise.resolve({
        success: false,
        error: new Error("Sync already in progress"),
        failureCount: consecutiveSyncFailures.value,
      });
    }

    const requestController = new AbortController();
    activeSyncController = requestController;
    const syncPromise = (async (): Promise<SyncAttemptResult> => {
      loading.value = true;
      try {
        // Only a dataset that came from Supabase carries a blacklist the server
        // reported; the empty placeholder's [] means unknown, not "none dismissed".
        const knownBlacklist = data.value?.dataSource === "SUPABASE" ? data.value.blacklist : undefined;
        const remoteData = await fetchRemoteWithTimeout({
          force,
          signal: requestController.signal,
          knownBlacklist,
        });
        const remoteDataValidation = v.safeParse(WebAppDataSchema, remoteData);

        if (!remoteDataValidation.success) {
          console.error("[Sync] Data Validation Failure Details:", JSON.stringify(remoteDataValidation.issues, null, 2));
          throw new Error("Remote data validation failed");
        }

        // [DECISION LOG] AN EMPTY ROSTER IS NOT A SUCCESSFUL SYNC: a clan always
        // has members, so an empty roster over a populated one means the read
        // lost its rows (a revoked grant, an unpopulated snapshot), not that the
        // clan emptied. Committing it would wipe the cache and show a green pill.
        const reconciledRemoteData = data.value
          ? preserveNewerSnapshotData(data.value, remoteDataValidation.output, true)
          : remoteDataValidation.output;
        if (reconciledRemoteData !== remoteDataValidation.output) {
          console.warn("[Sync] Preserved snapshot data with newer or verified publication evidence.");
        }
        const cachedMemberCount = data.value?.lb.length ?? 0;
        if (reconciledRemoteData.lb.length === 0 && cachedMemberCount > 0) {
          throw new Error(`Roster validation failed: the server returned no members over ${cachedMemberCount} cached`);
        }

        await yieldToInteractionFrame();
        await commitSyncResult(reconciledRemoteData, { remoteSuccess: true });
        lastSyncStatus.value = "SUCCESS";
        return { success: true };
      } catch (syncFailure: unknown) {
        // A newer failed attempt supersedes any recovery scheduled by an older
        // timeout, including a manual refresh that establishes a permanent error.
        clearRecoveryTimer();
        consecutiveSyncFailures.value++;
        const normalizedSyncError = normalizeSyncError(syncFailure);
        lastSyncStatus.value = classifySyncFailure(normalizedSyncError, isOnline.value);
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
      if (activeSyncPromise === syncPromise) {
        activeSyncPromise = null;
        activeSyncController = null;
      }
    });
    return syncPromise;
  }

  /**
   * Applies caller intent to the sync attempt without duplicating sync execution.
   *
   * @param syncIntent - Intent type ("background" or "manual").
   * @param force - If true, forces remote transport cache bypass.
   */
  async function runSync(
    syncIntent: SyncIntent,
    force: boolean,
    queueInvalidation = false,
  ): Promise<void> {
    if (isSyntheticMode.value) {
      console.debug("[Sync] Synthetic Mode active: Refreshing mock data");
      await commitSyncResult(generateMockData(), { remoteSuccess: true });
      return;
    }

    if (syncIntent === "background" && !isOnline.value && !force) {
      lastSyncStatus.value = "OFFLINE";
      return;
    }

    if (syncIntent === "background" && !force) {
      declinedBackgroundSyncs++;
      if (!backoffWaived && declinedBackgroundSyncs < getBackgroundBackoffSpan(consecutiveSyncFailures.value)) return;
      backoffWaived = false;
      declinedBackgroundSyncs = 0;
    }

    const syncResult = await executeRemoteSync(force, queueInvalidation);
    if (syncResult.success) return;

    if (syncIntent === "background") scheduleTimeoutRecovery(syncResult.error);

    // [DECISION LOG] Fault Visibility Thresholding: Suppress transient background sync
    // errors until consecutive failure count meets SYNC_FAILURE_VISIBILITY_THRESHOLD (3)
    // to avoid user notification noise, while immediately exposing manual or unhydrated errors.
    const shouldExposeFailure = syncIntent === "manual"
      || !data.value
      || data.value.timestamp === 0
      || syncResult.failureCount >= SYNC_FAILURE_VISIBILITY_THRESHOLD;

    if (shouldExposeFailure) syncError.value = describeSyncFailure(syncResult.error);
  }

  /** Triggers a user-visible foreground synchronization from Supabase. */
  async function refreshFromSupabase(): Promise<void> {
    await runSync("manual", true);
  }

  /**
   * Refreshes after a server invalidation, queuing one pass behind an active sync.
   *
   * @remarks
   * [DECISION LOG] COALESCE INVALIDATION LISTENERS: Synchronous listeners triggered by the same
   * invalidation event share a single batched Promise to prevent redundant network bursts.
   *
   * @returns Promise that resolves when the invalidation sync completes.
   */
  function refreshAfterInvalidation(): Promise<void> {
    if (invalidationBatchPromise) return invalidationBatchPromise;
    invalidationBatchPromise = Promise.resolve().then(() => {
      // Release before the read starts: a later event must still queue a fresh pass.
      invalidationBatchPromise = null;
      return runSync("manual", true, true);
    });
    return invalidationBatchPromise;
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
    refreshAfterInvalidation,
    startBackgroundSync,
    updatePlayerLocally
  };
}
