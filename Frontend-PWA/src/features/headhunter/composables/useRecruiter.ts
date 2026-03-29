import { isWorkerConfigured, scanRecruitsDirect } from "@core/api/GasClient";
import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useConsoleController } from "@core/services/useConsoleController";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { useSyntheticMode } from "@core/services/useSyntheticMode";
import { useToast } from "@core/services/useToast";
import { computed, watch, ref } from "vue";
import { useHeadhunter } from "./useHeadhunter";
import { useRecruitBlacklist } from "./useRecruitBlacklist";
import { RECRUITER_SORT_OPTIONS } from "@core/utils/sortOptions";
import { RecruiterSort } from "@core/utils/sortStrategies";
import type { Recruit } from "@core/types";

/**
 * COMPOSABLE: useRecruiter
 *
 * @remarks
 * Specialized logic for the Recruiter view (Headhunter). Extracts data orchestration,
 * sorting strategies, turbo scan logic, and console controller configuration from the view.
 *
 * @returns
 * - All state and methods from `useConsoleController` (search, sort, selection).
 * - `sheetUrl`: Computed URL to the Headhunter tab in the backing Google Sheet.
 * - `isHydrated`: Indicates if initial data has been loaded from IndexedDB.
 * - `isShowcaseMode`: Boolean flag for demo/showcase state.
 * - `isRefreshing`: Indicates if a standard GAS sync is in progress.
 * - `isTurboScanning`: Indicates if a direct-to-worker "Turbo Scan" is active.
 * - `syncError`: Error message from the last sync attempt.
 * - `sortOptions`: Configuration for the recruitment-specific sorting UI.
 * - `handleRefresh`: Orchestrates both Turbo Scan and full GAS sync.
 * - `dismissBulk`: Triggers dismissal for all currently selected recruits.
 * - `onSelectScore`: Selection helper for score-based filtering.
 * - `handleSearchUpdate`: Proxy for controller search updates.
 *
 * @sideeffects
 * - Updates local state and IndexedDB via `updateLocalData`.
 * - Triggers asynchronous dismissals on the GAS backend.
 * - Interacts with `useRecruitBlacklist` to manage dismissal tombstones.
 * - Dispatches toast notifications for user feedback.
 */
export function useRecruiter() {
  const { isShowcaseMode } = useShowcaseMode();
  const { isSyntheticMode } = useSyntheticMode();
  const clashDataStore = useClashDataStore();
  const { data, isRefreshing } = storeToRefs(clashDataStore);
  const { refresh: refreshGas } = clashDataStore;
  const { dismissRecruitsAction, injectRecruits } = useHeadhunter();
  const blacklist = useRecruitBlacklist();
  const { undo, success, info } = useToast();

  // 🛡️ PRE-FILTER: Exclude Tombstones and apply 50-recruit "Active Window"
  const recruits = computed(() => {
    const alive = (data.value?.hh || []).filter(
      (recruit) => !blacklist.tombstones.value.has(recruit.id),
    );
    // [ADR] Parity with Spreadsheet: Show only the top 50 active recruits.
    // The "infinite scroll" strategy is implemented via automatic replacement:
    // as items are dismissed, the next best results from the 100-item pre-compiled
    // pool slide in from the "backup" 50, maintaining the 50-recruit window.
    return alive.slice(0, 50);
  });

  const controller = useConsoleController({
    data: recruits,
    isRefreshing,
    filterFn: (recruit: Recruit) => [recruit.n, recruit.id],
    sortStrategies: RecruiterSort,
    defaultSort: "score",
    deepLinkPrefix: "recruit-",
    batchIdMapper: (recruit: Recruit) => recruit.id,
    statsLabel: "Recruit",
    sheetName: ["Headhunter", "Recruiter"],
    scoreGetter: (recruit: Recruit) => recruit.potentialScore || 0,
    refresh: clashDataStore.refreshWorker,
    onDismiss: dismissBulk,
    currentSource: storeToRefs(clashDataStore).currentSource,
    hubSyncTime: storeToRefs(clashDataStore).hubSyncTime,
    lastSyncTime: storeToRefs(clashDataStore).lastSyncTime,
    lastCompiledTime: storeToRefs(clashDataStore).lastCompiledTime,
    lastFetchedTime: storeToRefs(clashDataStore).lastFetchedTime,
  });

  const sortOptions = RECRUITER_SORT_OPTIONS;

  // 🧹 CLEANUP: Extra Recruit Logic managed here
  watch(
    () => data.value?.hh,
    (newRecruits) => {
      if (newRecruits && newRecruits.length > 0) {
        const currentIds = newRecruits.map((r) => r.id);
        blacklist.prune(currentIds);
      }
    },
    { deep: true, immediate: true },
  );

  /**
   * RECRUIT DISMISSAL ENGINE
   *
   * @remarks
   * Implements a "Zero Latency" pattern for UI responsiveness.
   *
   * 1. POINT-OF-IMPACT: Hide recruits immediately using local tombstones.
   * 2. BACKGROUND SYNC: Dispatch the dismissal to the GAS backend.
   * 3. RECOVERY: Roll back local state only if the server explicitly rejects the change.
   */
  function executeDismiss(recruitsToRemove: Recruit[]) {
    const ids = recruitsToRemove.map(r => r.id);
    
    // 🎯 DIRECT SCORE CAPTURE: Extract score at the point of dismissal
    const items = recruitsToRemove.map(r => ({
      id: r.id,
      score: r.potentialRawScore || 0,
      potentialRawScore: r.potentialRawScore || 0
    }));

    console.log('[Dismissal] Captured scores:', items.map(i => `${i.id}: ${i.score}`));

    const { undismissRecruitsAction } = useHeadhunter();

    // ⚡ ZERO LATENCY: Visual hide (Tombstone injection)
    blacklist.hide(ids);

    let backendCalled = false;

    backendCalled = true;
    dismissRecruitsAction(items).catch(() => {
      // RECOVERY: The dismissRecruitsAction already handles rollback and 
      // error notification for non-transient errors. We just restore 
      // visibility if the action totally fails beyond transient retry.
      blacklist.restore(ids);
    });

    // Show undo toast
    undo(`Dismissed ${ids.length} recruits`, () => {
      // 1. Immediate Local Restore
      blacklist.restore(ids);
      
      // If we have the original recruit data, restore it to the local state
      // to avoid waiting for a refresh or showing filtered out items.
      if (recruitsToRemove.length > 0) {
        undismissRecruitsAction(ids, recruitsToRemove);
      } else if (backendCalled) {
        // Fallback if we don't have local data
        info("Restoring from server...");
        refreshGas();
      }

      success("Dismissal cancelled");
    });
  }

  function dismissBulk() {
    if (controller.selectedIds.value.length === 0) return;
    const ids = [...controller.selectedIds.value];
    
    // 🎯 CAPTURE FULL RECRUITS: Get the complete objects before any state changes
    const recruitsToRemove = recruits.value.filter(r => ids.includes(r.id));
    
    controller.clearSelection();
    executeDismiss(recruitsToRemove);
  }

  return {
    ...controller,
    isShowcaseMode,
    sortOptions,
    dismissBulk,
  };
}
