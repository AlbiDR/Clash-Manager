import { ref, shallowRef, readonly, watch } from "vue";
import { fetchRemote } from "../api/gasClient";
import type { WebAppData } from "../types";
import { useSyntheticMode } from "./useSyntheticMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useShowcaseMode } from "./useShowcaseMode";
import { generateMockData } from "../utils/mockData";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { useWakeLock } from "./useWakeLock";
import { useConnectionStatus } from "./useConnectionStatus";

// Global State
const clashData = shallowRef<WebAppData | null>(null);
// Initialize as hydrated=false to force Skeletons on first paint
const isHydrated = ref(false);
const isRefreshing = ref(false);
const lastSyncTime = ref<number | null>(null);
const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
const syncError = ref<string | null>(null);
const SNAPSHOT_KEY = "cm_hydration_snapshot";

// Singleton Composables (Module Level)
const { isSyntheticMode } = useSyntheticMode();
const { isBlueprintMode } = useBlueprintMode();
const { isShowcaseMode } = useShowcaseMode();

// Broadcast Channel Integration
const { post: broadcast } = useBroadcastChannel((msg) => {
  if (msg.type === "DATA_SYNC_SUCCESS") {
    // Another tab brought fresh data. Reload from local storage/IDB to sync.
    if (!isRefreshing.value) {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timestamp > (lastSyncTime.value || 0)) {
          clashData.value = parsed;
          lastSyncTime.value = parsed.timestamp;
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
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(newData));
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
 *
 * @sideeffects
 * - Writes to `localStorage` (key: `cm_hydration_snapshot`) on every successful sync.
 * - Broadcasts 'DATA_SYNC_SUCCESS' messages via `BroadcastChannel` to synchronize other tabs.
 * - Listens for 'DATA_SYNC_SUCCESS' messages to trigger background reloads.
 * - Acquires/Releases `WakeLock` during active sync to prevent device sleep.
 */
export function useClashData() {
  /**
   * STEP 1: LOAD LOCAL (Sync/Fast)
   *
   * @remarks
   * Essential for LCP optimization. This should be called immediately after
   * app mounting to hydrate the UI with cached data before the network responds.
   */
  function loadLocal() {
    if (isHydrated.value) return; // Already loaded

    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        clashData.value = parsed;
        lastSyncTime.value = parsed.timestamp || Date.now();
      }
    } catch (e) {
      localStorage.removeItem(SNAPSHOT_KEY);
      clashData.value = null;
    } finally {
      isHydrated.value = true;
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
    // CONCURRENCY MANAGEMENT:
    // Cancel any previous pending request to prevent race conditions where
    // an older request might overwrite newer data.
    if (refreshAbortController) {
      refreshAbortController.abort("replaced");
    }
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    // TIMEOUT PROTECTION: Force fail if network hangs (40s)
    const timeoutId = setTimeout(() => {
      if (refreshAbortController) {
        refreshAbortController.abort("timeout");
      }
    }, 40000);

    const startTime = Date.now();

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      // UX FIX: Clear error immediately so UI shows loading state, not stale error
      syncError.value = null;

      // MODE GUARD:
      // If special modes are active, we mock the network success state.
      if (
        isSyntheticMode.value ||
        isBlueprintMode.value ||
        isShowcaseMode.value
      ) {
        // UX STABILITY:
        // Maintain the 800ms "thinking" time even in mock modes to prevent
        // the UI from feeling jarringly fast/nervous.
        await new Promise((resolve) => setTimeout(resolve, 800));
        startBackgroundSync();
        syncStatus.value = "success";
        isRefreshing.value = false;
        clearTimeout(timeoutId);
        return;
      }

      const remoteData = await fetchRemote({ signal, force: true });

      // UX STABILITY (Anti-Flicker):
      // On extremely fast connections (or when GAS responds instantly), the
      // transition from Skeletons -> Content can happen too fast to be
      // perceived comfortably. We enforce a minimum 800ms visibility for
      // the loading state to ensure a stable visual rhythm.
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      clashData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";
      
      // Notify unified status of success
      const { setSuccess } = useConnectionStatus();
      setSuccess();

      // PERFORMANCE OPTIMIZATION:
      // Disk I/O (localStorage) is blocking. We offload the snapshot write
      // to the browser's idle period to ensure the main thread remains
      // responsive for the immediate post-sync UI re-renders.
      const saveTask = window.requestIdleCallback || setTimeout;
      saveTask(() => {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(remoteData));
      });

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

      // UX STABILITY:
      // Even on error, we maintain the 800ms delay to prevent the error state
      // from "flashing" before the user can recognize the loading phase.
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      clearTimeout(timeoutId);
      
      // Release syncing state
      const { setSyncing } = useConnectionStatus();
      setSyncing(false);

      if (refreshAbortController?.signal === signal) {
        isRefreshing.value = false;
        refreshAbortController = null;
        setTimeout(() => {
          if (syncStatus.value === "success") syncStatus.value = "idle";
        }, 2000);
      }
    }
  }

  // Coordination: Inform status badge of syncing via watcher or direct injection
  const { setSyncing } = useConnectionStatus();
  watch(isRefreshing, (refreshing) => {
    setSyncing(refreshing);
  }, { immediate: true });

  // Synchronize data source when special modes change
  watch(
    [isSyntheticMode, isBlueprintMode, isShowcaseMode],
    () => {
      startBackgroundSync();
    },
    { flush: "post" },
  );

  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

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