// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useConsoleController } from "@core/services/useConsoleController";
import { useBlitzMode } from "@core/services/useBlitzMode";
import { useSelectionStore } from "@core/services/useSelectionStore";
import { LEADERBOARD_SORT_OPTIONS } from "@core/utils/sortOptions";
import { LeaderboardSort } from "@core/utils/sortStrategies";
import type { LeaderboardMember } from "@core/types";

/**
 * COMPOSABLE: useLeaderboard
 *
 * @remarks
 * Specialized logic for the Leaderboard view (Roster). Orchestrates the
 * transformation of raw clan member data into a sorted, searchable, and
 * selectable list via the `useConsoleController` (@core/services).
 *
 * Following the CleanStack Architecture (Section III), this feature-level
 * composable acts as a specialized controller that configures generic core
 * infrastructure for the Roster domain.
 *
 * @returns
 * - All state and methods from `useConsoleController` (search, sort, selection).
 * - `sortOptions`: Configuration for the roster-specific sorting UI.
 *
 * @sideeffects
 * - Inherits side effects from `useConsoleController`, including UI coordination
 *   for the batch action FAB and deep-link processing on hydration.
 */
export function useLeaderboard() {
  const clashDataStore = useClashDataStore();
  const { members } = storeToRefs(clashDataStore);

  // [REFACTOR] ARCHITECTURAL ALIGNMENT: Adopt the shared Blitz pipeline so the
  // Roster FAB exposes the same Open/Blitz batch actions as Headhunter. Members
  // are not dismissible, so dismissal simply clears the selection and the
  // dismiss affordance keeps the neutral "close" icon (not Blitz's "trash").
  const selectionStore = useSelectionStore();
  const blitz = useBlitzMode(selectionStore);

  const controller = useConsoleController({
    data: members,
    filterFn: (member: LeaderboardMember) => [member.n, member.id],
    sortStrategies: LeaderboardSort,
    sortOptions: LEADERBOARD_SORT_OPTIONS,
    defaultSort: "score",
    deepLinkPrefix: "member-",
    batchIdMapper: (member: LeaderboardMember) => member.id,
    statsLabel: "Member",
    scoreGetter: (member: LeaderboardMember) => member.performanceScore || 0,
    selectionStore,
    fabState: computed(() => ({
      ...blitz.fabState.value,
      dismissIcon: "close",
    })),
    layoutEvents: computed(() => ({
      "fab-action": blitz.handleAction,
      "fab-blitz": blitz.handleBlitz,
      "clear-selection": blitz.clearSelection,
      "fab-dismiss": blitz.clearSelection,
    })),
  });

  return {
    ...controller,
  };
}
