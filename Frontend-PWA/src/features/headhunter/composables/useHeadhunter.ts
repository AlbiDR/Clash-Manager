// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { NetworkError, dismissRecruits, subscribeToBlacklist, undismissRecruits } from "@core/api/SupabaseClient";
import { useAppSettings } from "@core/services/useAppSettings";
import { useBadge } from "@core/services/useBadge";
import { useBroadcastChannel } from "@core/services/useBroadcastChannel";
import { useClashDataStore, DEFAULT_SCORE_THRESHOLD } from "@core";
import { storeToRefs } from "pinia";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { onUnmounted, watch } from "vue";
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
 * Satisfies ADR Section III: Validation Boundaries by ensuring all state
 * mutations go through the authoritative clashDataStore.
 *
 * **Side Effects:**
 * - Dispatches network requests to Supabase via `dismissRecruits`/`undismissRecruits`.
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
   * OPTIMISTIC DISMISSAL HANDLER
   *
   * @remarks
   * Performs an immediate, optimistic removal of recruits from the local state.
   * This ensures the UI remains responsive while the network request is in flight.
   *
   * @param ids - The array of recruit IDs to be removed from the local store.
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

  // REALTIME SYNCHRONIZATION
  // Subscribe to server-authoritative INSERT/DELETE events on drivers.recruit_blacklist.
  // INSERT: a recruit was dismissed (on this or another device) — apply local removal.
  // DELETE: a recruit was undismissed — trigger a full pool refresh to restore their data.
  // The returned cleanup function removes the Supabase channel on component unmount.
  const stopBlacklistSync = subscribeToBlacklist(
    (playerTag) => {
      // Normalize: Realtime sends #ABC123; store recruit IDs are ABC123 (without prefix).
      const id = playerTag.startsWith('#') ? playerTag.slice(1) : playerTag;
      applyLocalDismissal([id]);
    },
    () => { clashDataStore.refreshFromSupabase(); },
  );
  onUnmounted(stopBlacklistSync);

  /**
   * BADGE SYNCHRONIZATION
   *
   * @remarks
   * Synchronizes the application-level badge count with the current recruit pool.
   * Depending on user settings, it either counts all recruits or only those
   * exceeding the "high potential" threshold.
   *
   * @param data - The current state of the WebAppData.
   */
  function updateHeadhunterBadge(data: WebAppData | null) {
    if (data?.hh) {
      const threshold = modules.notificationThreshold || DEFAULT_SCORE_THRESHOLD;
      const count = modules.notificationBadgeHighPotential
        // THREAT: Anemic variable 'r' hid intent. Using domain-descriptive 'recruit' [Target B 4].
        ? data.hh.filter((recruit) => recruit.potentialScore >= threshold).length
        : data.hh.length;
      setBadge(count);
    }
  }

  /**
   * RECRUIT CHANGE PROCESSOR
   *
   * @remarks
   * Evaluates the delta between data snapshots to identify newly discovered
   * elite recruits. If settings permit, it triggers a system-level local
   * notification to alert the user.
   *
   * @param oldData - The previous state of the WebAppData.
   * @param newData - The incoming, authoritative state of the WebAppData.
   */
  function processRecruitChanges(oldData: WebAppData | null, newData: WebAppData) {
    if (!newData?.hh || !modules.experimentalNotifications) return;
    const threshold = modules.notificationThreshold || DEFAULT_SCORE_THRESHOLD;
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
   * Satisfies ADR Section IV: Resilience by implementing transient error
   * suppression and automated rollback for non-transient failures.
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
      const errorName = syncError instanceof Error ? syncError.name : "Error";
      const errorMessage = syncError instanceof Error ? syncError.message : String(syncError);

      // AbortError: the user navigated away mid-request. Roll back local hh state silently.
      // The in-memory tombstone resets on component remount; server state is authoritative on next load.
      if (errorName === "AbortError") {
        updateLocalData(oldData);
        return;
      }

      // All other failures (NetworkError, server errors, etc.) are surfaced to the user.
      // The caller (useRecruiter) is responsible for rolling back the optimistic tombstone.
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
