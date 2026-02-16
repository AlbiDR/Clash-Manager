import { useApiState } from "@core/api/useApiState";
import { useClashData } from "@core/services/useClashData";
import { useConsoleController } from "@core/services/useConsoleController";
import { useShowcaseMode } from "@core/services/useShowcaseMode";
import { computed } from "vue";
import { SORT_DESCRIPTIONS } from "@core/utils/sortOptions";
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
    sortStrategies: LeaderboardSort,
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

  const sheetUrl = computed(() => {
    const url = pingData.value?.spreadsheetUrl;
    const gid = pingData.value?.sheets?.Leaderboard;
    return url && gid ? `${url}#gid=${gid}` : url;
  });

  return {
    ...controller,
    data,
    isShowcaseMode,
    sortOptions,
    sheetUrl,
  };
}
