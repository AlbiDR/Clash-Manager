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

  async function refresh() {
    // Cancel previous pending request
    if (refreshAbortController) {
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

    const startTime = Date.now();

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      // ⚡ UX FIX: Clear error immediately so UI shows loading state, not stale error
      syncError.value = null;

      // No-op guard for special modes
      if (
        isSyntheticMode.value ||
        isBlueprintMode.value ||
        isShowcaseMode.value
      ) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        startBackgroundSync();
        syncStatus.value = "success";
        isRefreshing.value = false;
        clearTimeout(timeoutId);
        return;
      }

      const remoteData = await fetchRemote({ signal, force: true });

      // ⚡ UX FIX: Enforce minimum 800ms load time to prevent UI flicker on fast failures/success
      // This ensures the user sees the "loading" state even if the error happens instantly
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      clashData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";

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

      // ⚡ UX FIX: Ensure we respected minimum delay even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      clearTimeout(timeoutId);
      if (refreshAbortController?.signal === signal) {
        isRefreshing.value = false;
        refreshAbortController = null;
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