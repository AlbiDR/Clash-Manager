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
import { useBlitzMode } from "@core/services/useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { useLeaderboardScraper } from "./useLeaderboardScraper";

/**
 * COMPOSABLE: useRecruiter
 *
 * @remarks
 * Specialized orchestrator for the Headhunter (Recruiter) feature (Layer 3).
 * It unifies global data hydration, local optimistic filtering, and multi-tier
 * automation (Blitz, Leaderboard Scraping) into a single reactive interface.
 *
 * Satisfies ADR Section III: Validation Boundaries and ADR Section IV: Resilience.
 *
 * **Reactive State:**
 * - `recruits`: A filtered, sorted, and windowed (top 50) view of the recruit pool.
 * - `isRefreshing`: Boolean indicating if the authoritative store is currently fetching.
 * - Inherits reactive search, sort, and selection state from `useConsoleController`.
 *
 * @returns
 * - `...controller`: Standardized console interface (search, sort, filter, pagination).
 * - `isRefreshing`: Ref indicating background data synchronization status.
 * - `dismissBulk`: Action to trigger batch dismissal of the current selection.
 */
export function useRecruiter() {
  const clashDataStore = useClashDataStore();
  const { data, isRefreshing } = storeToRefs(clashDataStore);
  const { dismissRecruitsAction } = useHeadhunter();
  const blacklist = useRecruitBlacklist();
  const { undo, success, info } = useToast();
  const { isOnline } = useConnectionStatus();

  /**
   * RECRUIT POOL FILTER
   * [DECISION LOG] Applying a 50-recruit "Active Window" to ensure UI performance
   * while prioritizing the highest-potential candidates.
   */
  const recruits = computed(() => {
    // [THREAT:] Unvalidated nullish data access could trigger runtime crashes.
    const filtered = (data.value?.hh || []).filter(
      (recruit) => !blacklist.tombstones.value.has(recruit.id),
    );
    // Sort descending by potentialScore to prioritize highest scores
    const sorted = filtered.sort((candidateA, candidateB) => (candidateB.potentialScore || 0) - (candidateA.potentialScore || 0));
    // Return top 50 active recruits
    return sorted.slice(0, 50);
  });

  // [REFACTOR] ARCHITECTURAL ALIGNMENT: Decouple Headhunter-specific selection
  // and blitz orchestration from the generic console controller.
  const selectionStore = useSelectionStore();

  /**
   * BLITZ ENGINE
   * [DECISION LOG] Orchestrates automated batch deep-linking via a dedicated
   * core service to prevent feature-logic bloat in the UI layer.
   */
  const blitz = useBlitzMode(selectionStore);

  /**
   * SCRAPER ENGINE
   * [DECISION LOG] Injects automated scraping capabilities into the Recruiter
   * view, delegating Blitz-aware results to the shared orchestrator.
   */
  const scraper = useLeaderboardScraper(selectionStore, blitz.handleBlitz);

  /**
   * CONSOLE CONTROLLER CONFIGURATION
   * [DECISION LOG] We delegate display logic (sorting, filtering, search) to
   * the generic useConsoleController while parameterizing it with Headhunter-specific
   * actions (Blitz, Dismissal, Scraping) via layoutEvents.
   */
  const controller = useConsoleController({
    data: recruits,
    filterFn: (recruit: Recruit) => [recruit.n, recruit.id],
    sortStrategies: RecruiterSort,
    sortOptions: RECRUITER_SORT_OPTIONS,
    defaultSort: "score",
    sortPersistenceKey: "cm_console_sort_headhunter",
    deepLinkPrefix: "recruit-",
    batchIdMapper: (recruit: Recruit) => recruit.id,
    statsLabel: "Recruit",
    scoreGetter: (recruit: Recruit) => recruit.potentialScore || 0,
    onDismiss: dismissBulk,
    selectionStore,
    // [DECISION LOG] Harvest scouts external clanless players from the Clash
    // Royale leaderboard, which only makes sense on this recruiting view — not
    // on Roster, which manages existing clan members. Roster shares this same
    // Blitz FAB but must not advertise Harvest as available.
    fabState: computed(() => ({ ...blitz.fabState.value, harvestEnabled: true })),
    layoutEvents: computed(() => ({
      "fab-action": blitz.handleAction,
      "fab-blitz": blitz.handleBlitz,
      "clear-selection": blitz.clearSelection,
      "fab-dismiss": dismissBulk,
      "fab-global-harvest": () => scraper.executeHarvest("global"),
      "fab-local-harvest": () => scraper.executeHarvest("local"),
      "fab-abort-harvest": scraper.abortHarvest,
    }))
  });

  /**
   * ACTION: executeDismiss
   * Orchestrates the multi-stage dismissal of recruits, coordinating in-memory
   * tombstones, network persistence, and undo capabilities.
   *
   * @param recruitsToRemove - The array of recruit objects to dismiss.
   */
  function executeDismiss(recruitsToRemove: Recruit[]) {
    if (!isOnline.value) {
      info("Connection required to dismiss recruits.");
      return;
    }

    const targetRecruitIds = recruitsToRemove.map(recruitSnapshot => recruitSnapshot.id);
    // [GUARD] Payload transformation: Mapping domain model to RPC input schema.
    const dismissalPayload = recruitsToRemove.map(recruitSnapshot => ({
      id: recruitSnapshot.id,
      name: recruitSnapshot.n,
      score: recruitSnapshot.potentialRawScore || 0,
      raw_potential_score: recruitSnapshot.potentialRawScore || 0
    }));

    const { undismissRecruitsAction } = useHeadhunter();

    // 1. [OPTIMISTIC] Inject in-memory tombstones to hide items immediately.
    blacklist.hide(targetRecruitIds);

    // 2. [PERSISTENCE] Dispatch network request. Failure triggers rollback.
    dismissRecruitsAction(dismissalPayload).catch(() => {
      blacklist.restore(targetRecruitIds);
    });

    // 3. [RESILIENCE] Provide undo mechanism for user error recovery.
    undo(`Dismissed ${targetRecruitIds.length} recruits`, () => {
      blacklist.restore(targetRecruitIds);
      undismissRecruitsAction(targetRecruitIds, recruitsToRemove);
      success("Dismissal cancelled");
    });
  }

  /**
   * ACTION: dismissBulk
   * Triggers the dismissal flow for all currently selected items.
   */
  function dismissBulk() {
    if (controller.selectedIds.value.length === 0) {
      blitz.clearSelection();
      return;
    }
    const targetRecruitIds = [...controller.selectedIds.value];
    const recruitsToRemove = recruits.value.filter(recruitSnapshot => targetRecruitIds.includes(recruitSnapshot.id));
    
    // Clear selection state before dismissal to prevent UI desync.
    blitz.clearSelection();
    executeDismiss(recruitsToRemove);
  }

  return {
    ...controller,
    isRefreshing,
    dismissBulk,
  };
}
