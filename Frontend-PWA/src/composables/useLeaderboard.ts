import { computed } from "vue";
import { useClashData } from "./useClashData";
import { useApiState } from "./useApiState";
import { useConsoleController } from "./useConsoleController";
import { useShowcaseMode } from "./useShowcaseMode";
import { parseTimeAgoValue } from "../utils/formatters";
import { SORT_DESCRIPTIONS } from "../utils/sortOptions";
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

  const sortStrategies: Record<
    string,
    (a: LeaderboardMember, b: LeaderboardMember) => number
  > = {
    score: (a, b) => {
      // PRIMARY: Normalized Performance Score (0-100)
      const diff = (b.performanceScore || 0) - (a.performanceScore || 0);
      if (diff !== 0) return diff;
      
      // SECONDARY: Raw Performance Score (Unlimited) - High Precision Tie-Breaker
      return (b.performanceRawScore || 0) - (a.performanceRawScore || 0);
    },
    trend: (a, b) => (b.dt || 0) - (a.dt || 0),
    trophies: (a, b) => (b.t || 0) - (a.t || 0),
    name: (a, b) => a.n.localeCompare(b.n),
    donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
    tenure: (a, b) => (b.d.days || 0) - (a.d.days || 0),
    last_seen: (a, b) =>
      parseTimeAgoValue(a.d.seen) - parseTimeAgoValue(b.d.seen),
  };

  const controller = useConsoleController({
    data: members,
    isHydrated,
    isRefreshing,
    syncError,
    lastSyncTime,
    filterFn: (m: LeaderboardMember) => [m.n, m.id],
    sortStrategies,
    defaultSort: "score",
    deepLinkPrefix: "member-",
    batchIdMapper: (m: LeaderboardMember) => m.id,
    statsLabel: "Member",
    sheetName: "Leaderboard",
    scoreGetter: (m: LeaderboardMember) => m.performanceScore || 0,
    refresh,
  });

  const sortOptions = [
    {
      label: "Performance",
      value: "score",
      desc: SORT_DESCRIPTIONS.performance,
    },
    {
      label: "Momentum",
      value: "trend",
      desc: SORT_DESCRIPTIONS.momentum,
    },
    {
      label: "Trophies",
      value: "trophies",
      desc: SORT_DESCRIPTIONS.trophies,
    },
    {
      label: "Donations",
      value: "donations_day",
      desc: SORT_DESCRIPTIONS.donations_day,
    },
    {
      label: "Tenure",
      value: "tenure",
      desc: SORT_DESCRIPTIONS.tenure,
    },
    {
      label: "Name",
      value: "name",
      desc: SORT_DESCRIPTIONS.name,
    },
    {
      label: "Last Seen",
      value: "last_seen",
      desc: SORT_DESCRIPTIONS.last_seen,
    },
  ];

  return {
    ...controller,
    data,
    isShowcaseMode,
    sortOptions,
  };
}
