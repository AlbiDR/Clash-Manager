import { ref, shallowRef, readonly, watch } from "vue";
import { fetchRemote } from "../api/gasClient";
import type { WebAppData } from "../types";
import { useSyntheticMode } from "./useSyntheticMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useShowcaseMode } from "./useShowcaseMode";
import { generateMockData } from "../utils/mockData";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { useWakeLock } from "./useWakeLock";

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
 *
 * @param {WebAppData} newData - The fresh state object to apply.
 * @remarks
 * Side Effect: Persists the updated state to `localStorage` immediately.
 * This ensures that if the user refreshes after a manual action (like dismissing
 * a recruit), the state remains consistent.
 */
function updateLocalData(newData: WebAppData) {
  clashData.value = newData;
  // We generally don't persist optimistic updates to the snapshot
  // unless we are sure it's stable, but for simple dismissals it's fine
  // IF needed. For now, we will let the consumer decide persistence or
  // we can add a flag. The original implementation persisted on dismissal.
  // We'll expose a persist helper if needed, or just let the consumer assume
  // this is in-memory only.
  // Actually, checking original code: dismissRecruitsAction DID persist to localStorage.
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(newData));
}

/**
 * CENTRAL DATA MANAGEMENT HUB
 * The primary engine for synchronizing game data across the application.
 *
 * @returns {Object} Reactive state and methods for data orchestration.
 * @property {Readonly<Ref<WebAppData|null>>} data - The core game data (leaderboard, recruiter).
 * @property {Readonly<Ref<boolean>>} isHydrated - Indicates if local data has been loaded.
 * @property {Readonly<Ref<boolean>>} isRefreshing - True if a network sync is in progress.
 * @property {Readonly<Ref<string|null>>} syncStatus - Enum: 'idle' | 'syncing' | 'success' | 'error'.
 * @property {Readonly<Ref<string|null>>} syncError - Human-readable error message if sync fails.
 */
export function useClashData() {
  /**
   * STEP 1: LOAD LOCAL (Sync/Fast)
   * Hydrates the reactive state from `localStorage` snapshot.
   *
   * @remarks
   * PERFORMANCE: This function should be called AFTER `app.mount()` (e.g., in a
   * requestIdleCallback) to avoid blocking the Largest Contentful Paint (LCP).
   * It provides the "Stale" part of the Stale-While-Revalidate (SWR) pattern.
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
      // Blueprint mode simulation: No data loaded yet? Or partial?
      // Original logic: updateBadgeCount(mock); clanData.value = null;
      // We will mimic: null data to force skeleton
      clashData.value = null;
      lastSyncTime.value = Date.now();
      return;
    }

    if (isSyntheticMode.value) {
      // console.log("Synthetic Mode Active");
      const mock = generateMockData();
      clashData.value = mock;
      lastSyncTime.value = mock.timestamp;
      return;
    }

    // Default: Return to network data if no mode active
    refresh();
  }

  /**
   * STEP 2: LOAD NETWORK (Async/Slow)
   * Triggers a remote fetch from Google Apps Script.
   *
   * @remarks
   * Side Effect: Updates `localStorage` and `IndexedDB` upon success.
   * Side Effect: Broadcasts completion to other open tabs via `BroadcastChannel`.
   * Side Effect: Requests a Screen Wake Lock during active synchronization.
   */
  async function refresh() {
    if (isRefreshing.value) {
      // If already refreshing, decide if we should debounce or replace.
      // For now, we replace to ensure freshest data.
    }

    // Cancel previous pending request to prevent race conditions.
    // Using a specific reason allows the error handler to distinguish
    // between an intentional replacement and a network failure.
    if (refreshAbortController) {
      refreshAbortController.abort("replaced");
    }
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    // TIMEOUT PROTECTION: Force fail if network hangs (40s).
    // Apps Script execution limits and cold starts can vary; 40s provides
    // enough buffer for heavy ETL without leaving the UI in a permanent skeleton state.
    const timeoutId = setTimeout(() => {
      if (refreshAbortController) {
        refreshAbortController.abort("timeout");
      }
    }, 40000);

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      syncError.value = null;

      // No-op guard for special modes
      if (
        isSyntheticMode.value ||
        isBlueprintMode.value ||
        isShowcaseMode.value
      ) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        startBackgroundSync(); // Re-run the appropriate mock logic
        syncStatus.value = "success";
        isRefreshing.value = false;
        clearTimeout(timeoutId);
        return;
      }

      const remoteData = await fetchRemote({ signal, force: true });

      clashData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";

      // Save to snapshot for next cold start LCP
      // Use requestIdleCallback or setTimeout to avoid blocking input during save
      const saveTask = window.requestIdleCallback || setTimeout;
      saveTask(() => {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(remoteData));
        // Note: IDB caching is already handled inside fetchRemote() in gasClient.ts
      });

      // Broadcast success to other tabs
      broadcast({ type: "DATA_SYNC_SUCCESS", timestamp: remoteData.timestamp });
    } catch (e: unknown) {
      // Handle AbortSignal logic
      if (signal.aborted) {
        // WHY: If replaced by a new request, we silently exit.
        // We do NOT want to show an error state if the user manually re-triggered
        // a refresh or if a mode change canceled the current one.
        if (signal.reason === "replaced") {
          return;
        }
        // WHY: If timed out, we transition to error to let the user know
        // the network/server is unresponsive.
        if (signal.reason === "timeout") {
          syncStatus.value = "error";
          syncError.value = "Request Timed Out";
          return;
        }
        // Fallback for standard aborts (shouldn't happen often with above logic)
        return;
      }

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      clearTimeout(timeoutId);
      // Only reset flags if THIS was the active controller (not replaced)
      if (refreshAbortController?.signal === signal) {
        isRefreshing.value = false;
        refreshAbortController = null;

        // Auto-dismiss success state
        setTimeout(() => {
          if (syncStatus.value === "success") syncStatus.value = "idle";
        }, 2000);
      }
    }
  }

  // Synchronize data source when special modes change
  watch(
    [isSyntheticMode, isBlueprintMode, isShowcaseMode],
    () => {
      startBackgroundSync();
    },
    { flush: "post" },
  );

  // Logic: Screen Wake Lock (Logic #15)
  // Use shared composable for stability and DRY compliance
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
    updateLocalData, // Exposed for optimistic updates from business logic
  };
}
