// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useConsoleController } from "@core/services/useConsoleController";
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
  });

  return {
    ...controller,
  };
}
