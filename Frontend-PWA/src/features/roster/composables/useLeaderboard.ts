import { useClashDataStore } from "@core";
import { storeToRefs } from "pinia";
import { useConsoleController } from "@core/services/useConsoleController";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { computed } from "vue";
import { LEADERBOARD_SORT_OPTIONS } from "@core/utils/sortOptions";
import { LeaderboardSort } from "@core/utils/sortStrategies";
import type { LeaderboardMember } from "@core/types";

/**
 * COMPOSABLE: useLeaderboard
 *
 * @remarks
 * Specialized logic for the Leaderboard view. Extracts data orchestration,
 * sorting strategies, and console controller configuration from the view.
 *
 * @returns
 * - All state and methods from useConsoleController.
 * - `sheetUrl`: Computed URL to the Leaderboard sheet.
 * - `sortOptions`: Array of sorting configurations for the UI.
 * - `onSelectScore`: Specific helper for score-based bulk selection.
 * - `handleSearch`: Search update handler.
 */
export function useLeaderboard() {
  const { isShowcaseMode } = useShowcaseMode();
  const clashDataStore = useClashDataStore();
  const { members } = storeToRefs(clashDataStore);
  const { refresh } = clashDataStore;

  const controller = useConsoleController({
    data: members,
    filterFn: (member: LeaderboardMember) => [member.n, member.id],
    sortStrategies: LeaderboardSort,
    defaultSort: "score",
    deepLinkPrefix: "member-",
    batchIdMapper: (member: LeaderboardMember) => member.id,
    statsLabel: "Member",
    sheetName: "Leaderboard",
    scoreGetter: (member: LeaderboardMember) => member.performanceScore || 0,
    refresh: clashDataStore.refreshWorker,
  });

  const sortOptions = LEADERBOARD_SORT_OPTIONS;

  return {
    ...controller,
    isShowcaseMode,
    sortOptions,
  };
}
