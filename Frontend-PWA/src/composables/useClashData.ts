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

// 📡 Broadcast Channel Integration
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
 * 🛠 LOCAL UPDATE HELPER
 * Allows other logic (like optimistic updates) to modify the state directly.
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

export function useClashData() {
  // ⚡ STEP 1: LOAD LOCAL (Sync/Fast)
  // Call this AFTER app.mount() to avoid blocking LCP
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

  // ⚡ STEP 2: LOAD NETWORK (Async/Slow)
  let refreshAbortController: AbortController | null = null;

  async function startBackgroundSync() {
    if (isShowcaseMode.value) {
      // ⚡ PERFORMANCE: Generate only 1 item in Showcase mode
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
      // console.log("🌟 Synthetic Mode Active");
      const mock = generateMockData();
      clashData.value = mock;
      lastSyncTime.value = mock.timestamp;
      return;
    }

    // Default: Return to network data if no mode active
    refresh();
  }

  async function refresh() {
    if (isRefreshing.value) {
      // If already refreshing, decide if we should debounce or replace.
      // For now, we replace to ensure freshest data.
    }

    // Cancel previous pending request
    if (refreshAbortController) {
      // Pass a reason so we can distinguish this from a timeout
      refreshAbortController.abort("replaced");
    }
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    // 🛡️ TIMEOUT PROTECTION: Force fail if network hangs (40s)
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

      // 📡 Broadcast success to other tabs
      broadcast({ type: "DATA_SYNC_SUCCESS", timestamp: remoteData.timestamp });
    } catch (e: unknown) {
      // Handle AbortSignal logic
      if (signal.aborted) {
        // If replaced by a new request, we silently exit (do NOT set error)
        if (signal.reason === "replaced") {
          // console.log("Sync replaced by newer request");
          return;
        }
        // If timed out, we DO set error
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

  // 🛡️ Logic: Screen Wake Lock (Logic #15)
  // 🛡️ Logic: Screen Wake Lock (Logic #15)
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
