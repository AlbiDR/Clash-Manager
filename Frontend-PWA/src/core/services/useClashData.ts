import { useConnectionStatus, useWakeLock  } from "@shared";
import { fetchRemote } from "../api/GasClient";
import { loadCache, saveCache } from "./StorageService";
import { useBlueprintMode } from "./useBlueprintMode";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { useShowcaseMode } from "./useShowcaseMode";
import { useSyntheticMode } from "./useSyntheticMode";
import { ref, shallowRef, readonly, watch } from "vue";
import type { WebAppData } from "@core/types";
import { generateMockData } from "@core/utils/mockData";
// Global State
const clashData = shallowRef<WebAppData | null>(null);
// Initialize as hydrated=false to force Skeletons on first paint
const isHydrated = ref(false);
const isRefreshing = ref(false);
const lastSyncTime = ref<number | null>(null);
const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
const syncError = ref<string | null>(null);

// Singleton Composables (Module Level)
const { isSyntheticMode } = useSyntheticMode();
const { isBlueprintMode } = useBlueprintMode();
const { isShowcaseMode } = useShowcaseMode();

// Broadcast Channel Integration
const { post: broadcast } = useBroadcastChannel(async (msg) => {
  if (msg.type === "DATA_SYNC_SUCCESS") {
    // Another tab brought fresh data. Reload from IndexedDB to sync.
    if (!isRefreshing.value) {
      const cached = await loadCache();
      if (cached) {
        if (cached.timestamp > (lastSyncTime.value || 0)) {
          clashData.value = cached;
          lastSyncTime.value = cached.timestamp;
        }
      }
    }
  }
});

/**
 * LOCAL UPDATE HELPER
 * Allows other logic (like optimistic updates) to modify the state directly.
 */
function updateLocalData(newData: WebAppData) {
  clashData.value = newData;
  // PERSISTENCE: Ensure optimistic updates are saved to IndexedDB
  saveCache(newData).catch((e) => console.warn("[Data] Failed to persist optimistic update:", e));
}

/**
 * COMPOSABLE: useClashData
 *
 * @remarks
 * The central data hub of the application. Implements a Stale-While-Revalidate (SWR)
 * pattern to ensure near-instant initial paint (LCP) by hydrating from local storage
 * before attempting a background network refresh.
 *
 * @returns
 * - `data`: Readonly reactive reference to the inflated WebAppData.
 * - `isHydrated`: Indicates if the initial local storage load has completed.
 * - `isRefreshing`: Indicates if a background network sync is currently in progress.
 * - `syncStatus`: Unified status enum ('idle', 'syncing', 'success', 'error').
 * - `syncError`: Error message if the last sync attempt failed.
 * - `lastSyncTime`: Epoch timestamp of the last successful data acquisition.
 * - `loadLocal`: Function to hydrate state from IndexedDB.
 * - `startBackgroundSync`: Triggered when specialized modes change or on initial load.
 * - `refresh`: Force a network fetch from the GAS backend.
 * - `updateLocalData`: Direct state/storage override for optimistic updates.
 *
 * @sideeffects
 * - Persists data to `IndexedDB` (via `gasClient`) on every successful sync.
 * - Broadcasts 'DATA_SYNC_SUCCESS' messages via `BroadcastChannel` to synchronize other tabs.
 * - Listens for 'DATA_SYNC_SUCCESS' messages to trigger background reloads.
 * - Acquires/Releases `WakeLock` during active sync to prevent device sleep.
 * - Interacts with `useConnectionStatus` to update global system health state.
 */
export function useClashData() {
  /**
   * STEP 1: LOAD LOCAL (Async/Fast-ish)
   *
   * @remarks
   * Essential for LCP optimization. Hydrates the UI from IndexedDB.
   * While async, IndexedDB is faster for large data than blocking the
   * main thread with synchronous LocalStorage JSON.parse.
   */
  async function loadLocal() {
    if (isHydrated.value) return; // Already loaded

    try {
      const cached = await loadCache();
      if (cached) {
        clashData.value = cached;
        const ts = cached.timestamp || 0;
        lastSyncTime.value = ts || Date.now();

        // STALE CHECK
        // If data is > 5 minutes old, trigger background refresh to ensure
        // the user is not looking at significantly outdated clan metrics.
        const STALE_THRESHOLD = 5 * 60 * 1000;
        if (Date.now() - ts > STALE_THRESHOLD) {
          console.log("[Data] Cache is stale (>5m), triggering background sync...");
          refresh();
        }
      }
    } catch (e) {
      console.warn("[Data] Failed to load local cache:", e);
      clashData.value = null;
    } finally {
      isHydrated.value = true;
      // MODE RECOVERY: If a specialized mode is active, trigger the override sync 
      // immediately instead of waiting for the API handshake in main.ts.
      if (isBlueprintMode.value || isSyntheticMode.value || isShowcaseMode.value) {
        startBackgroundSync();
      }
    }
  }

  // STEP 2: LOAD NETWORK (Async/Slow)
  let refreshAbortController: AbortController | null = null;

  async function startBackgroundSync() {
    if (isShowcaseMode.value) {
      // PERFORMANCE: Generate only 1 item in Showcase mode
      const mock = generateMockData({ memberCount: 1, recruitCount: 1 });
      clashData.value = mock;
      lastSyncTime.value = mock.timestamp;
      return;
    }

    if (isBlueprintMode.value) {
      clashData.value = null;
      lastSyncTime.value = Date.now();
      return;
    }

    if (isSyntheticMode.value) {
      const mock = generateMockData();
      clashData.value = mock;
      lastSyncTime.value = mock.timestamp;
      return;
    }

    // Default: Return to network data if no mode active
    refresh();
  }

  /**
   * BACKGROUND REFRESH
   *
   * Orchestrates the network request to the GAS backend, including state management,
   * timeout protection, and UX stabilization delays.
   */
  async function refresh() {
    // CONCURRENCY MANAGEMENT
    // Abort existing requests to ensure only the latest sync attempt resolves.
    // Prevents "stale overwrite" race conditions on slow networks.
    if (refreshAbortController) {
      refreshAbortController.abort("replaced");
    }
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    // TIMEOUT PROTECTION
    // Force termination after 40s to prevent the UI from hanging indefinitely
    // in 'syncing' state if the Google Script or network pipe dies silently.
    const timeoutId = setTimeout(() => {
      if (refreshAbortController) {
        refreshAbortController.abort("timeout");
      }
    }, 40000);

    const startTime = Date.now();

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      // UX FIX: Clear previous error to reset the visual state to 'loading'.
      syncError.value = null;

      // MODE GUARD
      // Mock network success if demo/synthetic modes are engaged.
      if (
        isSyntheticMode.value ||
        isBlueprintMode.value ||
        isShowcaseMode.value
      ) {
        // UX STABILITY
        // Enforce a minimum "thinking" period to prevent UI jitter when
        // switching modes, maintaining a consistent interaction rhythm.
        await new Promise((resolve) => setTimeout(resolve, 800));
        startBackgroundSync();
        syncStatus.value = "success";
        isRefreshing.value = false;
        clearTimeout(timeoutId);
        return;
      }

      const remoteData = await fetchRemote({ signal, force: true });

      // UX STABILITY (Anti-Flicker)
      // If the backend responds too quickly, the jump from Skeletons to
      // content can feel jarring. We enforce an 800ms minimum visibility
      // for the loading state to allow the user's eye to track the change.
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      clashData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";
      
      // Update global system status to reflect successful connectivity.
      const { setSuccess } = useConnectionStatus();
      setSuccess();

      // REDUNDANCY REMOVED: fetchRemote already persists remoteData to IndexedDB.
      // We no longer need to manually write to localStorage here.

      broadcast({ type: "DATA_SYNC_SUCCESS", timestamp: remoteData.timestamp });
    } catch (e: unknown) {
      if (signal.aborted) {
        if (signal.reason === "replaced") return;
        if (signal.reason === "timeout") {
          syncStatus.value = "error";
          syncError.value = "Request Timed Out";
          return;
        }
        return;
      }

      // UX STABILITY
      // Maintain minimum visibility on error to prevent state "flashing".
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      clearTimeout(timeoutId);
      
      // Release syncing state in global status tracker.
      const { setSyncing } = useConnectionStatus();
      setSyncing(false);

      if (refreshAbortController?.signal === signal) {
        isRefreshing.value = false;
        refreshAbortController = null;
        // UX DELAY: Hold success state briefly before reverting to idle.
        setTimeout(() => {
          if (syncStatus.value === "success") syncStatus.value = "idle";
        }, 2000);
      }
    }
  }

  // Coordination: Synchronize status badge with active sync state.
  const { setSyncing } = useConnectionStatus();
  watch(isRefreshing, (refreshing) => {
    setSyncing(refreshing);
  }, { immediate: true });

  // Mode synchronization: Re-evaluate data source when specialized modes change.
  watch(
    [isSyntheticMode, isBlueprintMode, isShowcaseMode],
    () => {
      startBackgroundSync();
    },
    { flush: "post" },
  );

  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  /**
   * WAKE LOCK MANAGEMENT
   * Prevents the mobile screen from dimming or the OS from suspending the
   * network thread during an active synchronization process.
   */
  watch(syncStatus, (status: string) => {
    if (status === "syncing") requestWakeLock();
    else releaseWakeLock();
  });

  return {
    data: readonly(clashData),
    isHydrated: readonly(isHydrated),
    isRefreshing: readonly(isRefreshing),
    syncStatus: readonly(syncStatus),
    syncError: readonly(syncError),
    lastSyncTime: readonly(lastSyncTime),
    loadLocal,
    startBackgroundSync,
    refresh,
    updateLocalData,
  };
}
