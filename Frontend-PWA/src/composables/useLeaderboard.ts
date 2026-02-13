import { computed } from "vue";
import { useClashData } from "./useClashData";
import { useApiState } from "./useApiState";
import { useConsoleController } from "./useConsoleController";
import { useShowcaseMode } from "./useShowcaseMode";
import { LEADERBOARD_SORT_OPTIONS } from "../utils/sortOptions";
import { LEADERBOARD_SORT_STRATEGIES } from "../utils/sortStrategies";
import type { LeaderboardMember } from "../types";

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
  const { pingData } = useApiState();
  const { isShowcaseMode } = useShowcaseMode();
  const { data, isHydrated, isRefreshing, syncError, lastSyncTime, refresh } =
    useClashData();

  const members = computed(() => data.value?.lb || []);

  const controller = useConsoleController({
    data: members,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn: (m: LeaderboardMember) => [m.n, m.id],
    sortStrategies: LEADERBOARD_SORT_STRATEGIES,
    defaultSort: "score",
    deepLinkPrefix: "member-",
    batchIdMapper: (m: LeaderboardMember) => m.id,
    statsLabel: "Member",
    sheetName: "Leaderboard",
    scoreGetter: (m: LeaderboardMember) => m.performanceScore || 0,
    refresh,
  });

  return {
    ...controller,
    data,
    isShowcaseMode,
    sortOptions: LEADERBOARD_SORT_OPTIONS,
  };
}
