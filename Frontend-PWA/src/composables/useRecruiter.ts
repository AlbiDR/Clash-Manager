import { computed, watch, ref } from "vue";
import { useClashData } from "./useClashData";
import { useHeadhunter } from "./useHeadhunter";
import { useApiState } from "./useApiState";
import { useToast } from "./useToast";
import { useRecruitBlacklist } from "./useRecruitBlacklist";
import { useConsoleController } from "./useConsoleController";
import { useShowcaseMode } from "./useShowcaseMode";
import { scanRecruitsDirect, isWorkerConfigured } from "../api/gasClient";
import type { Recruit } from "../types";

/**
 * COMPOSABLE: useRecruiter
 *
 * @remarks
 * Specialized logic for the Recruiter view (Headhunter). Extracts data orchestration,
 * sorting strategies, turbo scan logic, and console controller configuration from the view.
 */
export function useRecruiter() {
  const { pingData } = useApiState();
  const { isShowcaseMode } = useShowcaseMode();
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

  const sheetUrl = computed(() => {
    if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets)
      return undefined;
    const gid =
      pingData.value.sheets["Headhunter"] ?? pingData.value.sheets["Recruiter"];
    return gid !== undefined
      ? `${pingData.value.spreadsheetUrl}#gid=${gid}`
      : pingData.value.spreadsheetUrl;
  });

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
  const isTurboScanning = ref(false);

  async function handleRefresh() {
    if (isWorkerConfigured()) {
      isTurboScanning.value = true;
      info("Starting Turbo Scan via Worker...");

      // Direct Fetch (Bypassing GAS)
      const newCandidates = await scanRecruitsDirect();
      if (newCandidates && newCandidates.length > 0) {
        // Merge with existing data locally to update view instantly
        if (data.value) {
          // Simple merge: append new ones
          const existingIds = new Set(data.value.hh.map((r) => r.id));
          const merged = [...data.value.hh];
          let added = 0;
          newCandidates.forEach((c) => {
            if (!existingIds.has(c.id)) {
              merged.push(c);
              added++;
            }
          });
          // Update local state via helper
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

  function executeDismiss(ids: string[]) {
    // Capture recruits to restore in case of undo
    const recruitsToRestore = (data.value?.hh || []).filter(r => ids.includes(r.id));
    const { undismissRecruitsAction } = useHeadhunter();

    // ⚡ ZERO LATENCY: Point-of-impact hiding
    blacklist.hide(ids);

    // Track if backend update started
    let backendCalled = false;

    // Start sync immediately
    backendCalled = true;
    dismissRecruitsAction(ids).catch(() => {
      error("Failed to sync changes");
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

  // Specific Helper for Score Selection
  function onSelectScore(threshold: number, mode: "ge" | "le") {
    controller.handleSelectScore(threshold, mode, (r) => r.potentialScore || 0);
  }

  function handleSearchUpdate(val: string) {
    controller.searchQuery.value = val;
  }

  return {
    ...controller,
    sheetUrl,
    isHydrated,
    isShowcaseMode,
    isRefreshing,
    isTurboScanning,
    syncError,
    sortOptions,
    handleRefresh,
    dismissBulk,
    onSelectScore,
    handleSearchUpdate,
  };
}
