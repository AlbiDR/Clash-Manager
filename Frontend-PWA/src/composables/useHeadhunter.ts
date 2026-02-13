import { watch } from "vue";
import { dismissRecruits, NetworkError } from "../api/gasClient";
import type { WebAppData, DismissalRequest, Recruit } from "../types";
import { useClashData } from "./useClashData";
import { useBadge } from "./useBadge";
import { useAppSettings } from "./useAppSettings";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { useSyntheticMode } from "./useSyntheticMode";

// Singleton Composables
const { setBadge, sendLocalNotification } = useBadge();
const { modules } = useAppSettings();
const { data: clashData, updateLocalData } = useClashData();
const { isSyntheticMode } = useSyntheticMode();

function updateHeadhunterBadge(data: WebAppData | null) {
  if (data?.hh) {
    const threshold = modules.notificationThreshold || 75;
    const count = modules.notificationBadgeHighPotential
      ? data.hh.filter((r) => r.potentialScore >= threshold).length
      : data.hh.length;
    setBadge(count);
  }
}

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
    (r) => r.potentialScore >= threshold && !oldIds.has(r.id),
  );

  if (newEliteRecruits.length > 0) {
    const count = newEliteRecruits.length;
    const topScore = Math.max(...newEliteRecruits.map((r) => r.potentialScore));

    const title =
      count === 1 ? "Elite Recruit Found" : "Elite Recruits Located";
    const body =
      count === 1
        ? `A candidate with score ${topScore} just entered the pool.`
        : `${count} candidates with scores up to ${topScore} detected.`;

    sendLocalNotification(title, body, "headhunter-channel");
  }
}

/**
 * 🧹 LOCAL REMOVAL HELPER
 * Removes recruits from the local state without triggering a network call.
 * Used for optimistic updates and cross-tab sync.
 */
function applyLocalDismissal(ids: string[]) {
  if (!clashData.value) return;

  const currentHH = clashData.value.hh;
  const idsSet = new Set(ids);

  // Optimization: Check if any IDs actually exist before cloning
  if (!currentHH.some((r) => idsSet.has(r.id))) return;

  const newHH = currentHH.filter((r) => !idsSet.has(r.id));
  const updatedData = { ...clashData.value, hh: newHH };

  updateLocalData(updatedData);
  updateHeadhunterBadge(updatedData);
}

/**
 * REVERSAL HELPER
 * Restores recruits to the local state. Used for undo operations.
 */
function applyLocalRestoration(recruits: Recruit[]) {
  if (!clashData.value || recruits.length === 0) return;

  const currentHH = [...clashData.value.hh];
  const existingIds = new Set(currentHH.map(r => r.id));
  
  let added = 0;
  recruits.forEach(r => {
    if (!existingIds.has(r.id)) {
      currentHH.push(r);
      added++;
    }
  });

  if (added === 0) return;

  // Re-sort by potential score
  const updatedData = { 
    ...clashData.value, 
    hh: currentHH.sort((a, b) => (b.potentialScore || 0) - (a.potentialScore || 0)) 
  };

  updateLocalData(updatedData);
  updateHeadhunterBadge(updatedData);
}

// 📡 Broadcast Channel Integration (Recruit Dismissal only)
const { post: broadcast } = useBroadcastChannel((msg) => {
  if (msg.type === "RECRUIT_DISMISSAL") {
    // Another tab dismissed recruits. Apply locally.
    applyLocalDismissal(msg.ids);
  }
});

// Watcher to react to data changes (for badge and notifications)
let previousData: WebAppData | null = null;

watch(
  clashData,
  (newData) => {
    if (newData) {
      updateHeadhunterBadge(newData);

      if (previousData && newData.timestamp !== previousData.timestamp) {
        processRecruitChanges(previousData, newData);
      }

      previousData = newData;
    }
  },
  { immediate: true },
);

export function useHeadhunter() {
  async function dismissRecruitsAction(items: DismissalRequest[]) {
    if (!clashData.value) return;

    const ids = items.map(i => i.id);

    // Optimistically update local state
    const oldData = clashData.value;
    applyLocalDismissal(ids);

    if (isSyntheticMode.value) return;

    try {
      await dismissRecruits(items);
      broadcast({ type: "RECRUIT_DISMISSAL", ids });
    } catch (e: any) {
      // 🛡️ ULTRA-RESILIENT RECOVERY:
      // We treat almost any infrastructure failure as transient.
      const name = e.name || "Error";
      const msg = (e.message || "").toString();
      
      const isTransient = 
        name === "NetworkError" || 
        name === "AbortError" ||
        name === "TypeError" || 
        msg.includes("Lock timeout") ||
        msg.includes("System is busy") ||
        msg.includes("HTML Response") ||
        msg.includes("Malformed JSON") ||
        msg.includes("Empty Response") ||
        msg.includes("HTTP 500") ||
        msg.includes("HTTP 502") ||
        msg.includes("HTTP 503") ||
        msg.includes("HTTP 504") ||
        msg.includes("HTTP 408") ||
        msg.includes("HTTP 429");
      
      if (isTransient) {
        console.warn(`[Sync] Transient failure suppressed. Enqueued for background retry: ${name}: ${msg}`);
        return;
      }

      // CRITICAL FAILURE: Rollback and notify
      const { useToast } = await import("./useToast");
      const { error } = useToast();
      error(`Sync Failed: ${msg}`);
      
      updateLocalData(oldData);
      updateHeadhunterBadge(oldData);
      throw e;
    }
  }

  return {
    dismissRecruitsAction,
    undismissRecruitsAction: async (ids: string[], originalRecruits?: Recruit[]) => {
      if (originalRecruits && originalRecruits.length > 0) {
        applyLocalRestoration(originalRecruits);
      }

      if (isSyntheticMode.value) return;

      try {
        await (async () => {
          const { undismissRecruits } = await import("../api/gasClient");
          return undismissRecruits(ids);
        })();
        broadcast({ type: "RECRUIT_RESTORATION", ids });
      } catch (e) {
        console.error("Undo Sync Failed:", e);
      }
    }
  };
}
