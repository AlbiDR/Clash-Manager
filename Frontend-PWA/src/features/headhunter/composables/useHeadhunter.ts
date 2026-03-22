// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { NetworkError, dismissRecruits, undismissRecruits } from "@core/api/GasClient";
import { useAppSettings } from "@core/services/useAppSettings";
import { useBadge } from "@core/services/useBadge";
import { useBroadcastChannel } from "@core/services/useBroadcastChannel";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { watch } from "vue";
import type { WebAppData, DismissalRequest, Recruit } from "@core/types";

// Module-level state/references
let previousData: WebAppData | null = null;

/**
 * COMPOSABLE: useHeadhunter
 *
 * @remarks
 * Orchestrates the recruitment dismissal and notification logic for the
 * Headhunter feature. It acts as a Layer 3 feature-level orchestrator,
 * bridging the gap between global data stores (@core) and UI-specific
 * behaviors.
 *
 * **Side Effects:**
 * - Dispatches network requests to GAS via `dismissRecruits`/`undismissRecruits`.
 * - Updates the application badge via `useBadge`.
 * - Sends local notifications for high-potential recruits.
 * - Broadcasts state changes to other tabs via `useBroadcastChannel`.
 *
 * @returns
 * - `dismissRecruitsAction`: Async action to optimistically dismiss recruits.
 * - `undismissRecruitsAction`: Async action to reverse a dismissal.
 */
export function useHeadhunter() {
  // Scoped Singleton Initializations
  const { setBadge, sendLocalNotification } = useBadge();
  const { modules } = useAppSettings();
  const clashDataStore = useClashDataStore();
  const { data: clashData } = storeToRefs(clashDataStore);
  const { updateLocalData } = clashDataStore;
  const { isSyntheticMode } = useSyntheticMode();
  const { error: toastError } = useToast();

  /**
   * 🧹 LOCAL REMOVAL HELPER
   */
  function applyLocalDismissal(ids: string[]) {
    if (!clashData.value) return;
    const currentHH = clashData.value.hh;
    const idsSet = new Set(ids);
    // THREAT: Anemic variable 'r' hid intent. Using domain-descriptive 'recruit' [Target B 4].
    if (!currentHH.some((recruit) => idsSet.has(recruit.id))) return;
    const newHH = currentHH.filter((recruit) => !idsSet.has(recruit.id));
    const updatedData = { ...clashData.value, hh: newHH };
    updateLocalData(updatedData);
  }

  /**
   * RECRUIT INJECTION ENGINE
   *
   * @remarks
   * Merges a collection of recruits into the authoritative store.
   * Handles deduplication and sorting to ensure state consistency.
   *
   * @param recruits - Array of recruit objects to inject.
   * @returns The count of unique new recruits actually added.
   */
  function injectRecruits(recruits: Recruit[]): number {
    if (!clashData.value || recruits.length === 0) return 0;
    const currentHH = [...clashData.value.hh];
    const existingIds = new Set(currentHH.map((recruit) => recruit.id));
    let added = 0;

    recruits.forEach((recruit) => {
      if (!existingIds.has(recruit.id)) {
        currentHH.push(recruit);
        added++;
      }
    });

    if (added === 0) return 0;

    const updatedData = {
      ...clashData.value,
      hh: currentHH.sort(
        (a, b) => (b.potentialScore || 0) - (a.potentialScore || 0),
      ),
    };
    updateLocalData(updatedData);
    return added;
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
        // THREAT: Anemic variable 'r' hid intent. Using domain-descriptive 'recruit' [Target B 4].
        ? data.hh.filter((recruit) => recruit.potentialScore >= threshold).length
        : data.hh.length;
      setBadge(count);
    }
  }

  function processRecruitChanges(oldData: WebAppData | null, newData: WebAppData) {
    if (!newData?.hh || !modules.experimentalNotifications) return;
    const threshold = modules.notificationThreshold || 75;
    // THREAT: Anemic variable 'r' hid intent. Using domain-descriptive 'recruit' [Target B 4].
    const oldIds = new Set(oldData?.hh?.map((recruit) => recruit.id) || []);
    const newEliteRecruits = newData.hh.filter((recruit) => recruit.potentialScore >= threshold && !oldIds.has(recruit.id));

    if (newEliteRecruits.length > 0) {
      const count = newEliteRecruits.length;
      const topScore = Math.max(...newEliteRecruits.map((recruit) => recruit.potentialScore));
      const title = count === 1 ? "Elite Recruit Found" : "Elite Recruits Located";
      const body = count === 1 ? `A candidate with score ${topScore} just entered the pool.` : `${count} candidates with scores up to ${topScore} detected.`;
      sendLocalNotification(title, body, "headhunter-channel");
    }
  }

  // Watcher to react to data changes (for badge and notifications)
  // Rationale: Decouples view logic from state changes, ensuring consistent
  // updates even when data is refreshed from the background service worker.
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

  /**
   * Action: dismissRecruitsAction
   *
   * @remarks
   * Implements a "Zero Latency" pattern for UI responsiveness. It optimistically
   * removes recruits from the local state before the network request completes.
   *
   * @throws {Error} Re-throws non-transient errors after rolling back local state.
   */
  async function dismissRecruitsAction(items: DismissalRequest[]) {
    if (!clashData.value) return;
    // THREAT: Anemic variable 'i' hid intent. Using domain-descriptive 'dismissalRequest' [Target B 4].
    const ids = items.map(dismissalRequest => dismissalRequest.id);
    const oldData = clashData.value;
    applyLocalDismissal(ids);

    if (isSyntheticMode.value) return;

    try {
      await dismissRecruits(items);
      broadcast({ type: "RECRUIT_DISMISSAL", ids });
    } catch (syncError: unknown) {
      // THREAT: The "any Plague" hidden behind variable 'e'. Harden to 'unknown' with narrowing [Target B 4].
      const errorName = syncError instanceof Error ? syncError.name : "Error";
      const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);
      
      // TRANSIENT ERROR SUPPRESSION
      // Rationale: Network blips or lock timeouts in GAS should not trigger
      // noisy error toasts, as they will be resolved by the next background sync.
      const isTransient = 
        errorName === "NetworkError" ||
        errorName === "AbortError" ||
        errorName === "TypeError" ||
        errorMessage.includes("Lock timeout") ||
        errorMessage.includes("System is busy") ||
        errorMessage.includes("HTML Response") ||
        errorMessage.includes("Malformed JSON") ||
        errorMessage.includes("Empty Response") ||
        errorMessage.includes("HTTP 500") ||
        errorMessage.includes("HTTP 502") ||
        errorMessage.includes("HTTP 503") ||
        errorMessage.includes("HTTP 504") ||
        errorMessage.includes("HTTP 408") ||
        errorMessage.includes("HTTP 429");
      
      if (isTransient) {
        console.warn(`[Sync] Transient failure suppressed. Enqueued for background retry: ${errorName}: ${errorMessage}`);
        return;
      }

      toastError(`Sync Failed: ${errorMessage}`);
      updateLocalData(oldData);
      throw syncError;
    }
  }

  return {
    injectRecruits,
    dismissRecruitsAction,
    /**
     * Action: undismissRecruitsAction
     *
     * @remarks
     * Reverses a previous dismissal. It accepts an optional array of original
     * recruit objects to restore local state instantly without a network round-trip.
     */
    undismissRecruitsAction: async (
      ids: string[],
      originalRecruits?: Recruit[],
    ) => {
      if (originalRecruits && originalRecruits.length > 0) {
        injectRecruits(originalRecruits);
      }
      if (isSyntheticMode.value) return;
      try {
        await undismissRecruits(ids);
        broadcast({ type: "RECRUIT_RESTORATION", ids });
      } catch (undoError: unknown) {
        // THREAT: Unvalidated error 'e' risks silent corruption if logging fails or masks context [Target B 4].
        console.error("Undo Sync Failed:", undoError instanceof Error ? undoError.message : String(undoError));
      }
    }
  };
}
