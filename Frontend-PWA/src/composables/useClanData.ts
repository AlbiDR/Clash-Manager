import { ref, shallowRef, readonly, watch } from "vue";
import { loadCache, fetchRemote, dismissRecruits } from "../api/gasClient";
import type { WebAppData } from "../types";
import { useBadge } from "./useBadge";
import { useModules } from "./useModules";
import { useSyntheticMode } from "./useSyntheticMode";
import { useBlueprintMode } from "./useBlueprintMode";
import { useShowcaseMode } from "./useShowcaseMode";
import { generateMockData } from "../utils/mockData";
import { useBroadcastChannel } from "./useBroadcastChannel";

// Global State
const clanData = shallowRef<WebAppData | null>(null);
// Initialize as hydrated=false to force Skeletons on first paint
const isHydrated = ref(false);
const isRefreshing = ref(false);
const lastSyncTime = ref<number | null>(null);
const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
const syncError = ref<string | null>(null);
const SNAPSHOT_KEY = "cm_hydration_snapshot";

// Singleton Composables (Module Level)
const { setBadge, sendLocalNotification } = useBadge();
const { modules } = useModules();
const { isSyntheticMode } = useSyntheticMode();
const { isBlueprintMode } = useBlueprintMode();
const { isShowcaseMode } = useShowcaseMode();

function updateBadgeCount(data: WebAppData) {
  if (data?.hh) {
    const threshold = modules.notificationThreshold || 75;
    const count = modules.notificationBadgeHighPotential
      ? data.hh.filter((r) => r.s >= threshold).length
      : data.hh.length;
    setBadge(count);
  }
}

// 📡 Broadcast Channel Integration
const { post: broadcast } = useBroadcastChannel((msg) => {
  if (msg.type === "DATA_SYNC_SUCCESS") {
    // Another tab brought fresh data. Reload from local storage/IDB to sync.
    // We can just trigger loadLocal() again or force a soft re-hydration.
    // Ensure we don't loop endlessly.
    if (!isRefreshing.value) {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.timestamp > (lastSyncTime.value || 0)) {
          clanData.value = parsed;
          lastSyncTime.value = parsed.timestamp;
          updateBadgeCount(parsed);
        }
      }
    }
  }
});

/**
 * 🛠 RECRUIT NOTIFICATION ENGINE
 * Compares current pool with new incoming data to detect high-potential recruits.
 */
function processRecruitChanges(
  oldData: WebAppData | null,
  newData: WebAppData,
) {
  if (!newData?.hh || !modules.experimentalNotifications) return;

  const threshold = modules.notificationThreshold || 75;
  const oldIds = new Set(oldData?.hh?.map((r) => r.id) || []);

  const newEliteRecruits = newData.hh.filter(
    (r) => r.s >= threshold && !oldIds.has(r.id),
  );

  if (newEliteRecruits.length > 0) {
    const count = newEliteRecruits.length;
    const topScore = Math.max(...newEliteRecruits.map((r) => r.s));

    const title =
      count === 1 ? "Elite Recruit Found" : "Elite Recruits Located";
    const body =
      count === 1
        ? `A candidate with score ${topScore} just entered the pool.`
        : `${count} candidates with scores up to ${topScore} detected.`;

    sendLocalNotification(title, body, "headhunter-channel");
  }
}

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
    if (isShowcaseMode.value) {
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

    if (isSyntheticMode.value) {
      // console.log("🌟 Synthetic Mode Active");
      const mock = generateMockData();
      clanData.value = mock;
      lastSyncTime.value = mock.timestamp;
      updateBadgeCount(mock);
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

    // 🛡️ TIMEOUT PROTECTION: Force fail if network hangs (20s)
    const timeoutId = setTimeout(() => {
      if (refreshAbortController) {
        console.warn("Sync timed out (20s), aborting...");
        refreshAbortController.abort("timeout");
      }
    }, 20000);

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

      const remoteData = await fetchRemote(signal);

      // Trigger notification check before overwriting state
      processRecruitChanges(clanData.value, remoteData);

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
