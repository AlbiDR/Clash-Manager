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
import { useBlitzMode } from "./useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";

/**
 * COMPOSABLE: useRecruiter
 *
 * @remarks
 * Specialized logic for the Recruiter view (Headhunter). Orchestrates Manual Scouting 
 * and background synchronization with the Supabase backend.
 */
export function useRecruiter() {
  const clashDataStore = useClashDataStore();
  const { data, isRefreshing } = storeToRefs(clashDataStore);
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

  // [REFACTOR] ARCHITECTURAL ALIGNMENT: Decouple Headhunter-specific selection
  // and blitz orchestration from the generic console controller.
  const selectionStore = useSelectionStore();
  const blitz = useBlitzMode(selectionStore);

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
    selectionStore,
    fabState: blitz.fabState,
    layoutEvents: computed(() => ({
      "fab-action": blitz.handleAction,
      "fab-blitz": blitz.handleBlitz,
      "clear-selection": blitz.clearSelection,
      "fab-dismiss": blitz.clearSelection,
    }))
  });

  function executeDismiss(recruitsToRemove: Recruit[]) {
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
    blacklist.hide(targetRecruitIds);

    dismissRecruitsAction(dismissalPayload).catch(() => {
      blacklist.restore(targetRecruitIds);
    });

    undo(`Dismissed ${targetRecruitIds.length} recruits`, () => {
      blacklist.restore(targetRecruitIds);
      undismissRecruitsAction(targetRecruitIds, recruitsToRemove);
      success("Dismissal cancelled");
    });
  }

  function dismissBulk() {
    if (controller.selectedIds.value.length === 0) return;
    const targetRecruitIds = [...controller.selectedIds.value];
    const recruitsToRemove = recruits.value.filter(recruit => targetRecruitIds.includes(recruit.id));
    
    blitz.clearSelection();
    executeDismiss(recruitsToRemove);
  }

  return {
    ...controller,
    isRefreshing,
    dismissBulk,
  };
}
