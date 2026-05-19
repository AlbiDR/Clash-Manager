import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useConsoleController } from "@core/services/useConsoleController";
import { useToast } from "@core/services/useToast";
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, watch } from "vue";
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

  // PRE-FILTER: Exclude Tombstones and apply 50-recruit "Active Window"
  const recruits = computed(() => {
    const activeRecruits = (data.value?.hh || []).filter(
      (recruit) => !blacklist.tombstones.value.has(recruit.id),
    );
    console.debug(`[Recruiter] Data pipeline: ${data.value?.hh?.length || 0} fetched -> ${activeRecruits.length} active (post-blacklist)`);
    // [ADR] Parity with Source: Show only the top 50 active recruits.
    // The "infinite scroll" strategy is implemented via automatic replacement:
    // as items are dismissed, the next best results from the 250-item pre-compiled
    // pool slide in from the "backup" 200, maintaining the 50-recruit window.
    return activeRecruits.slice(0, 50);
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

  // BLACKLIST RECONCILIATION: Sync tombstones from server on every confirmed refresh.
  //
  // [FIX] CROSS-DEVICE DESYNC:
  // The previous strategy merged server blacklist state into the local tombstone set.
  // This was insufficient for the factory-reset scenario: a device with no local
  // tombstones would see all recruits as visible even if the server had blacklisted them.
  //
  // The fix uses forceReplace=true after every confirmed network refresh (isRefreshing
  // transitions from true -> false). This rebuilds the tombstone set from the
  // authoritative `drivers.recruit_blacklist` table, making the server the SSOT.
  //
  // `prune()` is only called when `hh` is non-empty to prevent the guard in prune()
  // from short-circuiting on error/empty states and incorrectly clearing tombstones.
  watch(isRefreshing, (nowRefreshing, wasRefreshing) => {
    // Only act when a refresh cycle COMPLETES (was refreshing, now done).
    const refreshCycleCompleted = wasRefreshing === true && nowRefreshing === false;

    if (refreshCycleCompleted && data.value) {
      // AUTHORITATIVE REPLACEMENT: Rebuild tombstone set from server SSOT.
      // forceReplace=true guarantees the local set mirrors the server's blacklist exactly,
      // correcting any drift caused by local-only adds on this device or dismissals
      // made on other devices that never reached this client's localStorage.
      blacklist.syncRemote(data.value.blacklist ?? [], true);

      // GARBAGE COLLECTION: Only prune against a non-empty active recruit list.
      // Rationale: An empty `hh` array may indicate a fetch error or a genuinely
      // empty pool. prune() already guards against empty arrays, but this explicit
      // check is a defensive second layer to prevent inadvertent tombstone removal.
      if (data.value.hh && data.value.hh.length > 0) {
        const currentIds = data.value.hh.map((recruit) => recruit.id);
        blacklist.prune(currentIds);
      }
    }
  }, { immediate: false });

  /**
   * RECRUIT DISMISSAL ENGINE
   *
   * @remarks
   * Implements a "Zero Latency" pattern for UI responsiveness.
   *
   * 1. POINT-OF-IMPACT: Hide recruits immediately using local tombstones.
   * 2. BACKGROUND SYNC: Dispatch the dismissal to the Supabase backend.
   * 3. RECOVERY: Roll back local state only if the server explicitly rejects the change.
   */
  /**
   * RECRUIT DISMISSAL ENGINE
   *
   * @remarks
   * Implements a "Zero Latency" pattern for UI responsiveness.
   *
   * @param recruitsToRemove - The set of recruits to be dismissed.
   */
  function executeDismiss(recruitsToRemove: Recruit[]) {
    const targetRecruitIds = recruitsToRemove.map(recruit => recruit.id);
    
    // 🎯 DIRECT SCORE CAPTURE: Extract score at the point of dismissal
    const dismissalPayload = recruitsToRemove.map(recruit => ({
      id: recruit.id,
      name: recruit.n,
      score: recruit.potentialRawScore || 0,
      raw_potential_score: recruit.potentialRawScore || 0
    }));

    console.log('[Dismissal] Captured scores:', dismissalPayload.map(dismissalItem => `${dismissalItem.id}: ${dismissalItem.score}`));

    const { undismissRecruitsAction } = useHeadhunter();

    // ⚡ ZERO LATENCY: Visual hide (Tombstone injection)
    blacklist.hide(targetRecruitIds);

    let isBackendContacted = false;

    isBackendContacted = true;
    dismissRecruitsAction(dismissalPayload).catch(() => {
      // RECOVERY: The dismissRecruitsAction already handles rollback and 
      // error notification for non-transient errors. We just restore 
      // visibility if the action totally fails beyond transient retry.
      blacklist.restore(targetRecruitIds);
    });

    // Show undo toast
    undo(`Dismissed ${targetRecruitIds.length} recruits`, () => {
      // 1. Immediate Local Restore
      blacklist.restore(targetRecruitIds);
      
      // If we have the original recruit data, restore it to the local state
      // to avoid waiting for a refresh or showing filtered out items.
      if (recruitsToRemove.length > 0) {
        undismissRecruitsAction(targetRecruitIds, recruitsToRemove);
      } else if (isBackendContacted) {
        // Fallback if we don't have local data
        info("Restoring from server...");
        refreshStore();
      }

      success("Dismissal cancelled");
    });
  }

  /**
   * Triggers the dismissal process for all currently selected recruits in the controller.
   */
  function dismissBulk() {
    if (controller.selectedIds.value.length === 0) return;
    const targetRecruitIds = [...controller.selectedIds.value];
    
    // 🎯 CAPTURE FULL RECRUITS: Get the complete objects before any state changes
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
