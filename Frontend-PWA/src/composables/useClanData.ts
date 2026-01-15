import { ref, shallowRef, readonly, watch } from "vue";
import { loadCache, fetchRemote, dismissRecruits } from "../api/gasClient";
import type { WebAppData } from "../types";
import { useBadge } from "./useBadge";
import { useModules } from "./useModules";
import { useDemoMode } from "./useDemoMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useExhibitionMode } from "./useExhibitionMode";
import { generateMockData } from "../utils/mockData";

// Global State
const clanData = shallowRef<WebAppData | null>(null);
// Initialize as hydrated=false to force Skeletons on first paint
const isHydrated = ref(false);
const isRefreshing = ref(false);
const lastSyncTime = ref<number | null>(null);
const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
const syncError = ref<string | null>(null);

const { setBadge } = useBadge();
const { modules } = useModules();
const { isDemoMode } = useDemoMode();
const { isBlueprintMode } = useBlueprintMode();
const { isExhibitionMode } = useExhibitionMode();

const SNAPSHOT_KEY = "cm_hydration_snapshot";

export function useClanData() {
  // ⚡ STEP 1: LOAD LOCAL (Sync/Fast)
  // Call this AFTER app.mount() to avoid blocking LCP
  function loadLocal() {
    if (isHydrated.value) return; // Already loaded

    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        clanData.value = parsed;
        lastSyncTime.value = parsed.timestamp || Date.now();
        updateBadgeCount(parsed);
      }
    } catch (e) {
      console.warn("Hydration failed (Corrupt Data), purging...", e);
      localStorage.removeItem(SNAPSHOT_KEY);
      clanData.value = null;
    } finally {
      isHydrated.value = true;
    }
  }

  // ⚡ STEP 2: LOAD NETWORK (Async/Slow)
  let refreshAbortController: AbortController | null = null;

  async function startBackgroundSync() {
    if (isExhibitionMode.value) {
      const mock = generateMockData();
      updateBadgeCount(mock);
      clanData.value = mock;
      lastSyncTime.value = mock.timestamp;
      return;
    }

    if (isBlueprintMode.value) {
      const mock = generateMockData();
      updateBadgeCount(mock); // Update with full count
      clanData.value = null; // Then force skeleton state
      lastSyncTime.value = Date.now();
      return;
    }

    if (isDemoMode.value) {
      // console.log("🌟 Demo Mode Active");
      const mock = generateMockData();
      clanData.value = mock;
      lastSyncTime.value = mock.timestamp;
      updateBadgeCount(mock);
      return;
    }

    // Fast DB Path (SWR) via IDB - still good for robust caching
    try {
      const cached = await Promise.race([
        loadCache(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("IDB Timeout")), 2000),
        ),
      ]);

      if (cached) {
        // Only update if cached data is newer than what we got from localStorage or if no local storage data was found.
        if (
          !clanData.value ||
          cached.timestamp > (clanData.value?.timestamp || 0)
        ) {
          clanData.value = cached;
          lastSyncTime.value = cached.timestamp;
          updateBadgeCount(cached);
          // console.log("⚡ IDB Cache Refresh: Applied newer data.");
        }
      }
    } catch (e) {
      console.warn("IDB Load Failed", e);
    }

    // Network Sync - always attempt to get the freshest data
    refresh();
  }

  function updateBadgeCount(data: WebAppData) {
    if (data?.hh) {
      const threshold = modules.notificationThreshold || 75;
      const count = modules.notificationBadgeHighPotential
        ? data.hh.filter((r) => r.s >= threshold).length
        : data.hh.length;
      setBadge(count);
    }
  }

  async function refresh() {
    if (isRefreshing.value) return;

    // Fix 5: Cancel previous pending request
    if (refreshAbortController) {
      refreshAbortController.abort();
    }
    refreshAbortController = new AbortController();

    try {
      isRefreshing.value = true;
      syncStatus.value = "syncing";
      syncError.value = null;

      // No-op guard for special modes
      if (isDemoMode.value || isBlueprintMode.value || isExhibitionMode.value) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        startBackgroundSync(); // Re-run the appropriate mock logic
        syncStatus.value = "success";
        isRefreshing.value = false;
        return;
      }

      const remoteData = await fetchRemote();

      clanData.value = remoteData;
      lastSyncTime.value = remoteData.timestamp;
      syncStatus.value = "success";

      // Save to snapshot for next cold start LCP
      // Use requestIdleCallback or setTimeout to avoid blocking input during save
      const saveTask = window.requestIdleCallback || setTimeout;
      saveTask(() => {
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(remoteData));
        // Note: IDB caching is already handled inside fetchRemote() in gasClient.ts
      });
      updateBadgeCount(remoteData);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return; // Ignore aborts

      console.error("Sync failed:", e);
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : "Sync failed";
    } finally {
      isRefreshing.value = false;
      refreshAbortController = null;
      setTimeout(() => {
        if (syncStatus.value === "success") syncStatus.value = "idle";
      }, 2000);
    }
  }

  // Synchronize data source when special modes change
  watch(
    [isDemoMode, isBlueprintMode, isExhibitionMode],
    () => {
      startBackgroundSync();
    },
    { flush: "post" },
  );

  async function dismissRecruitsAction(ids: string[]) {
    if (!clanData.value) return;

    const currentHH = clanData.value.hh;
    const idsSet = new Set(ids);
    const newHH = currentHH.filter((r) => !idsSet.has(r.id));

    const oldData = clanData.value;
    clanData.value = { ...oldData, hh: newHH };

    updateBadgeCount(clanData.value);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(clanData.value));

    try {
      await dismissRecruits(ids);
    } catch (e) {
      clanData.value = oldData;
      updateBadgeCount(clanData.value);
      throw e;
    }
  }

  // 🛡️ Logic: Screen Wake Lock (Logic #15)
  // Prevents device sleep during critical synchronization cycles
  let wakeLock: any = null;

  async function requestWakeLock() {
    if ("wakeLock" in navigator && syncStatus.value === "syncing") {
      try {
        wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.warn("Wake Lock failed", err);
      }
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  }

  watch(syncStatus, (status: string) => {
    if (status === "syncing") requestWakeLock();
    else releaseWakeLock();
  });

  return {
    data: readonly(clanData),
    isHydrated: readonly(isHydrated),
    isRefreshing: readonly(isRefreshing),
    syncStatus: readonly(syncStatus),
    syncError: readonly(syncError),
    lastSyncTime: readonly(lastSyncTime),
    loadLocal,
    startBackgroundSync,
    refresh,
    dismissRecruitsAction,
  };
}
