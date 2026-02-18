import { useConnectionStatus } from "./useConnectionStatus";
import { useWakeLock } from "./useWakeLock";
import { fetchRemote } from "../api/GasClient";
import { loadCache, saveCache } from "./StorageService";
import { useBlueprintMode } from "./useBlueprintMode";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { useShowcaseMode } from "./useShowcaseMode";
import { useSyntheticMode } from "./useSyntheticMode";
import { ref, shallowRef, readonly, watch } from "vue";
import type { WebAppData } from "@core/types";
import { generateMockData } from "../utils/mockData";

// Global State
const clashData = shallowRef<WebAppData | null>(null);
const isHydrated = ref(false);
const isRefreshing = ref(false);
const lastSyncTime = ref<number | null>(null);
const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
const syncError = ref<string | null>(null);

// Singleton Composables (Module Level)
// These are safe as they only return refs/methods without side effects on call
const { isSyntheticMode } = useSyntheticMode();
const { isBlueprintMode } = useBlueprintMode();
const { isShowcaseMode } = useShowcaseMode();

// ⚡ PERFORMANCE: Singleton state for global synchronization.
let watchesInitialized = false;
let broadcast: ((msg: any) => void) | null = null;

/**
 * LOCAL UPDATE HELPER
 * Allows other logic (like optimistic updates) to modify the state directly.
 */
function updateLocalData(newData: WebAppData) {
  clashData.value = newData;
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
 */
export function useClashData() {
  // ⚡ LAZY INIT: Initialize singleton watches and cross-tab broadcast once.
  // This prevents redundant watch cycles and evaluation issues in test environments.
  if (!watchesInitialized) {
    const { setSyncing: updateGlobalSyncStatus } = useConnectionStatus();
    watch(isRefreshing, (refreshing) => {
      updateGlobalSyncStatus(refreshing);
    }, { immediate: true });

    const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();
    watch(syncStatus, (status: string) => {
      if (status === "syncing") requestWakeLock();
      else releaseWakeLock();
    });

    const { post } = useBroadcastChannel(async (msg) => {
      if (msg.type === "DATA_SYNC_SUCCESS") {
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
    broadcast = post;

    watchesInitialized = true;
  }

  async function loadLocal() {
    if (isHydrated.value) return;

    try {
      const cached = await loadCache();
      if (cached) {
        clashData.value = cached;
        const ts = cached.timestamp || 0;
        lastSyncTime.value = ts || Date.now();

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
      if (isBlueprintMode.value || isSyntheticMode.value || isShowcaseMode.value) {
        startBackgroundSync();
      }
    }
  }

  let refreshAbortController: AbortController | null = null;

  async function startBackgroundSync() {
    if (isShowcaseMode.value) {
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

    refresh();
  }

  async function refresh() {
    if (refreshAbortController) {
      refreshAbortController.abort("replaced");
    }
    refreshAbortController = new AbortController();
    const signal = refreshAbortController.signal;

    const timeoutId = setTimeout(() => {
      if (refreshAbortController) {
        refreshAbortController.abort("timeout");
      }
    }, 40000);

    const startTime = Date.now();

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      syncError.value = null;

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

      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      clashData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";
      
      const { setSuccess } = useConnectionStatus();
      setSuccess();

      if (broadcast) {
        broadcast({ type: "DATA_SYNC_SUCCESS", timestamp: remoteData.timestamp });
      }
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

      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((resolve) => setTimeout(resolve, 800 - elapsed));
      }

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      clearTimeout(timeoutId);
      
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

  // Mode synchronization: Re-evaluate data source when specialized modes change.
  watch(
    [isSyntheticMode, isBlueprintMode, isShowcaseMode],
    () => {
      startBackgroundSync();
    },
    { flush: "post" },
  );

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
