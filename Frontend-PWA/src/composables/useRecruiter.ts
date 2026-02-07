import { computed, watch, ref } from "vue";
import { useClashData } from "./useClashData";
import { useHeadhunter } from "./useHeadhunter";
import { useApiState } from "./useApiState";
import { useToast } from "./useToast";
import { useRecruitBlacklist } from "./useRecruitBlacklist";
import { useConsoleController } from "./useConsoleController";
import { useShowcaseMode } from "./useShowcaseMode";
import { useSyntheticMode } from "./useSyntheticMode";
import { scanRecruitsDirect, isWorkerConfigured } from "../api/gasClient";
import type { Recruit } from "../types";

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
  const { pingData } = useApiState();
  const { isShowcaseMode } = useShowcaseMode();
  const { isSyntheticMode } = useSyntheticMode();
  const {
    data,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    refresh: refreshGas,
    updateLocalData,
  } = useClashData();
  const { dismissRecruitsAction } = useHeadhunter();
  const blacklist = useRecruitBlacklist();
  const { undo, success, error, info } = useToast();

  // 🛡️ PRE-FILTER: Exclude Tombstones
  const recruits = computed(() => {
    return (data.value?.hh || []).filter(
      (r) => !blacklist.tombstones.value.has(r.id),
    );
  });

  const getTs = (str?: string) => (str ? new Date(str).getTime() : 0);

  const sortStrategies: Record<string, (a: Recruit, b: Recruit) => number> = {
    score: (a, b) => (b.potentialScore || 0) - (a.potentialScore || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    time_found: (a, b) => getTs(b.d.ago) - getTs(a.d.ago),
    donations: (a, b) => (b.d.don || 0) - (a.d.don || 0),
  };

  const controller = useConsoleController({
    data: recruits,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn: (r: Recruit) => [r.n, r.id],
    sortStrategies,
    defaultSort: "score",
    deepLinkPrefix: "recruit-",
    batchIdMapper: (r: Recruit) => r.id,
    statsLabel: "Recruit",
    sheetName: ["Headhunter", "Recruiter"],
    scoreGetter: (r: Recruit) => r.potentialScore || 0,
    refresh: handleRefresh,
  });

  const sortOptions = [
    {
      label: "Potential",
      value: "score",
      desc: `**Suppositional quality score** based on account progression and historical reliability.\n\n**Algorithm:**\nCompares the candidate's account stats against your current Clan baseline (Hybrid Benchmark).\n\n**Signal:**\n"Potential" indicates how well this recruit is expected to perform if they were to join the clan today. Values are strictly capped at 100%.`,
    },
    {
      label: "Trophies",
      value: "trophies",
      desc: `**Current ladder ranking** pull via Supercell API.\n\n**Insight:**\nReflects mechanical skill and King Tower progression.`,
    },
    {
      label: "Donations",
      value: "donations",
      desc: `**Lifetime card donations** from previous Clan history.\n\n**Logic:**\nMeasures long-term generosity.`,
    },
    {
      label: "Recency",
      value: "time_found",
      desc: `**Timestamp of discovery** during recent tournament scans.`,
    },
    {
      label: "Name",
      value: "name",
      desc: `**Alphabetical ordering** by display name.`,
    },
  ];

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

  // ⚡ DIRECT SCAN: Turbo Mode
  // Intent: Bypass the GAS orchestration layer to fetch fresh data directly
  // from the Cloud Worker. This reduces latency and GAS quota consumption.
  const isTurboScanning = ref(false);

  /**
   * ORCHESTRATED REFRESH
   *
   * @remarks
   * Performs a dual-phase sync:
   * 1. Turbo Scan: Direct worker-to-client fetch for immediate recruitment updates.
   * 2. GAS Sync: Full system synchronization to ensure the local database matches the sheet.
   */
  async function handleRefresh() {
    if (isSyntheticMode.value || isShowcaseMode.value) {
      // Mock refresh already handled by useClashData watcher for mode changes,
      // but explicit refresh button should still feel responsive.
      return refreshGas();
    }

    if (isWorkerConfigured()) {
      isTurboScanning.value = true;
      info("Starting Turbo Scan via Worker...");

      // HYBRID MERGE
      // Intent: Injecting worker results directly into the local reactive state
      // allows the UI to update instantly without waiting for the slower
      // GAS execution cycle to complete and propagate changes.
      const newCandidates = await scanRecruitsDirect();
      if (newCandidates && newCandidates.length > 0) {
        if (data.value) {
          const existingIds = new Set(data.value.hh.map((r) => r.id));
          const merged = [...data.value.hh];
          let added = 0;
          newCandidates.forEach((c) => {
            if (!existingIds.has(c.id)) {
              merged.push(c);
              added++;
            }
          });

          updateLocalData({
            ...data.value,
            hh: merged.sort(
              (a, b) => (b.potentialScore || 0) - (a.potentialScore || 0),
            ),
          });
          success(`Turbo Scan: Found ${added} new recruits`);
        }
      } else {
        info("Turbo Scan complete. No new candidates.");
      }
      isTurboScanning.value = false;
    }

    // Always trigger full sync to ensure consistency
    refreshGas();
  }

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
  function executeDismiss(ids: string[]) {
    // PRESERVATION: Capture state for potential undo operations.
    const recruitsToRestore = (data.value?.hh || []).filter(r => ids.includes(r.id));
    const { undismissRecruitsAction } = useHeadhunter();

    // ⚡ ZERO LATENCY: Visual hide (Tombstone injection)
    blacklist.hide(ids);

    let backendCalled = false;

    backendCalled = true;
    dismissRecruitsAction(ids).catch(() => {
      error("Failed to sync changes");
      // ERROR RECOVERY: Remove tombstones to restore visibility.
      blacklist.restore(ids);
    });

    // Show undo toast
    undo(`Dismissed ${ids.length} recruits`, () => {
      // 1. Immediate Local Restore
      blacklist.restore(ids);
      
      // If we have the original recruit data, restore it to the local state
      // to avoid waiting for a refresh or showing filtered out items.
      if (recruitsToRestore.length > 0) {
        undismissRecruitsAction(ids, recruitsToRestore);
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
    controller.clearSelection();
    executeDismiss(ids);
  }

  return {
    ...controller,
    isHydrated,
    isShowcaseMode,
    isRefreshing,
    isTurboScanning,
    syncError,
    sortOptions,
    handleRefresh,
    dismissBulk,
  };
}
