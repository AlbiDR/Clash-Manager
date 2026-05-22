// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useClashDataStore } from "@core";
import { useConnectionStatus } from "@core/services/useConnectionStatus";
import { storeToRefs } from "pinia";
import { useConsoleController } from "@core/services/useConsoleController";
import { useToast } from "@core/services/useToast";
import { computed } from "vue";
import { useHeadhunter } from "./useHeadhunter";
import { useRecruitBlacklist } from "./useRecruitBlacklist";
import { RECRUITER_SORT_OPTIONS } from "@core/utils/sortOptions";
import { RecruiterSort } from "@core/utils/sortStrategies";
import type { Recruit } from "@core/types";

/**
 * COMPOSABLE: useRecruiter
 *
 * @remarks
 * Specialized logic for the Recruiter view (Headhunter). Orchestrates Manual Scouting 
 * and background synchronization with the Supabase backend.
 *
 * @returns
 * - All state and methods from `useConsoleController` (search, sort, selection).
 * - `isHydrated`: Indicates if initial data has been loaded from IndexedDB.
 * - `isShowcaseMode`: Boolean flag for demo/showcase state.
 * - `isRefreshing`: Indicates if a background sync is in progress.
 * - `isTurboScanning`: Indicates if a manual scouting trigger is active.
 * - `onSelectScore`: Selection helper for score-based filtering.
 * - `handleSearchUpdate`: Proxy for controller search updates.
 *
 * @sideeffects
 * - Updates local state and IndexedDB via `updateLocalData`.
 * - Triggers asynchronous dismissals on the Supabase backend.
 * - Interacts with `useRecruitBlacklist` to manage dismissal tombstones.
 * - Dispatches toast notifications for user feedback.
 */
export function useRecruiter() {
  const clashDataStore = useClashDataStore();
  const { data, isRefreshing } = storeToRefs(clashDataStore);
  const { refresh: refreshStore } = clashDataStore;
  const { dismissRecruitsAction } = useHeadhunter();
  const blacklist = useRecruitBlacklist();
  const { undo, success, info } = useToast();
  const { isOnline } = useConnectionStatus();

  // PRE-FILTER: Exclude Tombstones and apply 50-recruit "Active Window"
  const recruits = computed(() => {
  // Filter active recruits (exclude tombstones)
  const filtered = (data.value?.hh || []).filter(
    (recruit) => !blacklist.tombstones.value.has(recruit.id),
  );
  // Sort descending by potentialScore to prioritize highest scores
  const sorted = filtered.sort((a, b) => (b.potentialScore || 0) - (a.potentialScore || 0));
  // Return top 50 active recruits
  return sorted.slice(0, 50);
});

  const controller = useConsoleController({
    data: recruits,
    filterFn: (recruit: Recruit) => [recruit.n, recruit.id],
    sortStrategies: RecruiterSort,
    sortOptions: RECRUITER_SORT_OPTIONS,
    defaultSort: "score",
    deepLinkPrefix: "recruit-",
    batchIdMapper: (recruit: Recruit) => recruit.id,
    statsLabel: "Recruit",
    scoreGetter: (recruit: Recruit) => recruit.potentialScore || 0,
    onDismiss: dismissBulk,
  });


  /**
   * RECRUIT DISMISSAL ENGINE
   *
   * @remarks
   * Implements a "Zero Latency" pattern for UI responsiveness.
   *
   * @param recruitsToRemove - The set of recruits to be dismissed.
   */
  function executeDismiss(recruitsToRemove: Recruit[]) {
    // CONNECTIVITY GUARD: Dismissal requires an active connection.
    // With no offline queue, an offline dismiss would apply a tombstone that can
    // never be confirmed server-side, leaving the UI in a phantom dismissed state.
    if (!isOnline.value) {
      info("Connection required to dismiss recruits.");
      return;
    }

    const targetRecruitIds = recruitsToRemove.map(recruit => recruit.id);
    const dismissalPayload = recruitsToRemove.map(recruit => ({
      id: recruit.id,
      name: recruit.n,
      score: recruit.potentialRawScore || 0,
      raw_potential_score: recruit.potentialRawScore || 0
    }));

    const { undismissRecruitsAction } = useHeadhunter();

    // ZERO LATENCY: Visual hide via in-memory tombstone.
    blacklist.hide(targetRecruitIds);

    // Dispatch RPC; on failure the action surfaces the error and rolls back hh state.
    // This catch restores the tombstone so the recruit reappears in the list.
    dismissRecruitsAction(dismissalPayload).catch(() => {
      blacklist.restore(targetRecruitIds);
    });

    undo(`Dismissed ${targetRecruitIds.length} recruits`, () => {
      blacklist.restore(targetRecruitIds);
      undismissRecruitsAction(targetRecruitIds, recruitsToRemove);
      success("Dismissal cancelled");
    });
  }

  /**
   * Triggers the dismissal process for all currently selected recruits in the controller.
   */
  function dismissBulk() {
    if (controller.selectedIds.value.length === 0) return;
    const targetRecruitIds = [...controller.selectedIds.value];
    
    // [FOCUS] CAPTURE FULL RECRUITS: Get the complete objects before any state changes
    const recruitsToRemove = recruits.value.filter(recruit => targetRecruitIds.includes(recruit.id));
    
    controller.clearSelection();
    executeDismiss(recruitsToRemove);
  }

  return {
    ...controller,
    isRefreshing,
    dismissBulk,
  };
}
