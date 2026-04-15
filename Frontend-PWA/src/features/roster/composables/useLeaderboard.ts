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
 * Specialized logic for the Leaderboard view. Extracts data orchestration,
 * sorting strategies, and console controller configuration from the view.
 *
 * @returns
 * - All state and methods from useConsoleController.
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
    sheetName: "Leaderboard",
    scoreGetter: (member: LeaderboardMember) => member.performanceScore || 0,
  });

  return {
    ...controller,
    sortOptions: LEADERBOARD_SORT_OPTIONS,
  };
}
