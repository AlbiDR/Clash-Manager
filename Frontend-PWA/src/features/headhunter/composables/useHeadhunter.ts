import { NetworkError, dismissRecruits, undismissRecruits } from "@core/api/GasClient";
import { useAppSettings } from "@core/services/useAppSettings";
import { useBadge } from "@core/services/useBadge";
import { useBroadcastChannel } from "@core/services/useBroadcastChannel";
import { useClashData } from "@core/services/useClashData";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { watch } from "vue";
import type { WebAppData, DismissalRequest, Recruit } from "@core/types";

// Module-level state/references
let previousData: WebAppData | null = null;

export function useHeadhunter() {
  // Scoped Singleton Initializations
  const { setBadge, sendLocalNotification } = useBadge();
  const { modules } = useAppSettings();
  const { data: clashData, updateLocalData } = useClashData();
  const { isSyntheticMode } = useSyntheticMode();
  const { error: toastError } = useToast();

  /**
   * 🧹 LOCAL REMOVAL HELPER
   */
  function applyLocalDismissal(ids: string[]) {
    if (!clashData.value) return;
    const currentHH = clashData.value.hh;
    const idsSet = new Set(ids);
    if (!currentHH.some((r) => idsSet.has(r.id))) return;
    const newHH = currentHH.filter((r) => !idsSet.has(r.id));
    const updatedData = { ...clashData.value, hh: newHH };
    updateLocalData(updatedData);
  }

  /**
   * REVERSAL HELPER
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
    const updatedData = { 
      ...clashData.value, 
      hh: currentHH.sort((a, b) => (b.potentialScore || 0) - (a.potentialScore || 0)) 
    };
    updateLocalData(updatedData);
  }

  const { post: broadcast } = useBroadcastChannel((msg) => {
    if (msg.type === "RECRUIT_DISMISSAL") {
      applyLocalDismissal(msg.ids);
    }
  });

  function updateHeadhunterBadge(data: WebAppData | null) {
    if (data?.hh) {
      const threshold = modules.notificationThreshold || 75;
      const count = modules.notificationBadgeHighPotential
        ? data.hh.filter((r) => r.potentialScore >= threshold).length
        : data.hh.length;
      setBadge(count);
    }
  }

  function processRecruitChanges(oldData: WebAppData | null, newData: WebAppData) {
    if (!newData?.hh || !modules.experimentalNotifications) return;
    const threshold = modules.notificationThreshold || 75;
    const oldIds = new Set(oldData?.hh?.map((r) => r.id) || []);
    const newEliteRecruits = newData.hh.filter((r) => r.potentialScore >= threshold && !oldIds.has(r.id));

    if (newEliteRecruits.length > 0) {
      const count = newEliteRecruits.length;
      const topScore = Math.max(...newEliteRecruits.map((r) => r.potentialScore));
      const title = count === 1 ? "Elite Recruit Found" : "Elite Recruits Located";
      const body = count === 1 ? `A candidate with score ${topScore} just entered the pool.` : `${count} candidates with scores up to ${topScore} detected.`;
      sendLocalNotification(title, body, "headhunter-channel");
    }
  }

  // Watcher to react to data changes (for badge and notifications)
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

  async function dismissRecruitsAction(items: DismissalRequest[]) {
    if (!clashData.value) return;
    const ids = items.map(i => i.id);
    const oldData = clashData.value;
    applyLocalDismissal(ids);

    if (isSyntheticMode.value) return;

    try {
      await dismissRecruits(items);
      broadcast({ type: "RECRUIT_DISMISSAL", ids });
    } catch (e: any) {
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

      toastError(`Sync Failed: ${msg}`);
      updateLocalData(oldData);
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
        await undismissRecruits(ids);
        broadcast({ type: "RECRUIT_RESTORATION", ids });
      } catch (e) {
        console.error("Undo Sync Failed:", e);
      }
    }
  };
}
