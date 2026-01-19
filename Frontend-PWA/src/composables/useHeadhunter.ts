import { watch } from "vue";
import { dismissRecruits } from "../api/gasClient";
import type { WebAppData } from "../types";
import { useClashData } from "./useClashData";
import { useBadge } from "./useBadge";
import { useAppSettings } from "./useAppSettings";
import { useBroadcastChannel } from "./useBroadcastChannel";

// Singleton Composables
const { setBadge, sendLocalNotification } = useBadge();
const { modules } = useAppSettings();
const { data: clashData, updateLocalData } = useClashData();

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

// 📡 Broadcast Channel Integration (Recruit Dismissal only)
const { post: broadcast } = useBroadcastChannel((msg) => {
  if (msg.type === "RECRUIT_DISMISSAL") {
    // Another tab dismissed recruits. Apply locally.
    applyLocalDismissal(msg.ids);
  }
});

// Watcher to react to data changes (for badge and notifications)
// We need to keep track of old data for notification comparison
let previousData: WebAppData | null = null;

watch(
  clashData,
  (newData, oldData) => {
    // Note: oldData in deep watch or object replacement might be tricky.
    // If clashData is shallowRef and replaced entirely, oldData is correct.
    // If mutated, it might be same as newData.
    // useClashData uses shallowRef and always replaces the object or sets properties on a new object logic.

    if (newData) {
      updateHeadhunterBadge(newData);

      // Only process changes if we have both old (tracked manually or via watch) and new
      // But initial load (previousData is null) shouldn't verify notifications probably?
      // Or maybe strictly if it's an update.
      // The original code passed (clanData.value, remoteData) explicitly in the fetchRemote success block.
      // Here we are reacting to the state change.
      // If we want to strictly mimic "incoming remote data", we might need to rely on the fact that
      // updateLocalData or loadNetwork triggers this.
      // Let's rely on the watch, but be careful about re-triggering on local dismissal.
      // Local dismissal updates `clashData`. We don't want "New recruit found" if we just removed one.
      // Dismissal removes items, so `newEliteRecruits` will be empty (filter returns nothing new).
      // So logic holds up.

      // We need to be careful about not notifying on initial load from localStorage
      // if we consider that "new".
      // Original code called processRecruitChanges ONLY in `refresh()` (network sync) logic.
      // It did NOT call it in `loadLocal()`.
      // So we should probably NOT put this in a global watcher if we want exact parity.
      // However, making it reactive is cleaner.
      // Let's refine: The original code ONLY processed changes on `fetchRemote` success.
      // The watcher here triggers on ANY change (local or remote).
      // If we load from local, it triggers.
      // If we dismiss locally, it triggers.
      // If we dismiss, `newEliteRecruits` is empty. Safe.
      // If we load from local, it looks like "new data" compared to null.
      // All existing recruits will be "new".
      // We should prevent notifications on initial hydration.

      // But... how do we know if it's initial hydration?
      // Maybe we simply don't check `previousData` being null?
      if (previousData && newData.timestamp !== previousData.timestamp) {
        // Check if timestamp changed to ensure it's actually an update and not just a reference change?
        // Dismissal DOES NOT change timestamp.
        // Fetch remote DOES change timestamp.
        processRecruitChanges(previousData, newData);
      }

      previousData = newData;
    }
  },
  { immediate: true },
);

export function useHeadhunter() {
  async function dismissRecruitsAction(ids: string[]) {
    if (!clashData.value) return;

    // Optimistically update local state
    const oldData = clashData.value; // Keep reference for rollback
    applyLocalDismissal(ids);

    try {
      await dismissRecruits(ids);
      // 📡 Broadcast dismissal to other tabs on success
      broadcast({ type: "RECRUIT_DISMISSAL", ids });
    } catch (e) {
      // Revert on failure
      // We need to restore the *exact* old object to rollback
      updateLocalData(oldData);
      updateHeadhunterBadge(oldData);
      throw e;
    }
  }

  return {
    dismissRecruitsAction,
    // Expose helpers if needed by views, or they can trust the watcher
  };
}
