import { computed } from "vue";
import { useClashData } from "./useClashData";
import { useApiState } from "./useApiState";
import { useConsoleController } from "./useConsoleController";
import { useShowcaseMode } from "./useShowcaseMode";
import { parseTimeAgoValue } from "../utils/formatters";
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
    score: (a, b) => (b.performanceScore || 0) - (a.performanceScore || 0),
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
      desc: `**Hybrid ranking metric** combining War contribution, donations, and ladder progress.\n\n**Components:**\n• **War Fame**: Both current and average historical contribution.\n• **Donations**: Average daily card support to clanmates.\n• **Progression**: Current trophies and King Tower influence.\n• **Inactivity Decay**: Scoring drops by 10% for every day of absence beyond the grace period.\n\n**Final:** An all-encompassing value reflecting current status and reliability.`,
    },
    {
      label: "Momentum",
      value: "trend",
      desc: `**Factual velocity** representing the change in Raw Score since the last server refresh.\n\n**Logic:**\nΔ Score = [Current Snapshot] − [Last Database Snapshot].\n\n**Context:**\nSnapshots occur approximately every 6 hours. Scaling positive values indicate immediate peaking activity, while negative values suggest declining engagement.`,
    },
    {
      label: "Trophies",
      value: "trophies",
      desc: `**Current competitive ranking** from Trophy Road or Path of Legends.\n\n**Logic:**\nDirect pull from the Supercell API. Reflects 1v1 mechanics and King Tower progression.`,
    },
    {
      label: "Donations",
      value: "donations_day",
      desc: `**Average daily card donations** during the player's tenure.\n\n**Impact:**\nMeasures social generosity. High donators are vital for the Clan's card leveling economy.`,
    },
    {
      label: "Tenure",
      value: "tenure",
      desc: `**Total days within the Clan** for the current membership period.\n\n**Logic:**\nCalculated from the join date stored in the Clan database. High tenure indicates loyalty and consistency.`,
    },
    {
      label: "Name",
      value: "name",
      desc: `**Alphabetical ordering** by display name.`,
    },
    {
      label: "Last Seen",
      value: "last_seen",
      desc: `**Player activity timestamp** representing the elapsed time since the last detected in-game interaction.\n\n**Logic:**\nDirect pull from the most recent API snapshot. Values like "Just now" or "2h ago" indicate immediate presence, while longer durations suggest idling.\n\n**Utility:**\nCritical for identifying active contributors versus members who may be drifting away from engagement.`,
    },
  ];

  return {
    ...controller,
    data,
    isRefreshing,
    syncError,
    isShowcaseMode,
    sortOptions,
  };
}
