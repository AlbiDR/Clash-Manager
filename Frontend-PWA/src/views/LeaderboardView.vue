<script setup lang="ts">
import { computed } from "vue";
import { useClanData } from "../composables/useClanData";
import { useApiState } from "../composables/useApiState";
import { useConsoleLogic } from "../composables/useConsoleLogic";
import { parseTimeAgoValue } from "../utils/formatters";
import type { LeaderboardMember } from "../types";

import MemberCard from "../components/MemberCard.vue";
import ConsoleLayout from "../components/ConsoleLayout.vue";

const { pingData } = useApiState();

const sheetUrl = computed(() => {
  if (!pingData.value?.spreadsheetUrl || !pingData.value?.sheets)
    return undefined;
  const gid = pingData.value.sheets["Leaderboard"];
  return gid !== undefined
    ? `${pingData.value.spreadsheetUrl}#gid=${gid}`
    : pingData.value.spreadsheetUrl;
});

const { data, isHydrated, isRefreshing, syncError, lastSyncTime, refresh } =
  useClanData();
// Ensure we pass a Ref<LeaderboardMember[]>
const members = computed(() => data.value?.lb || []);

const sortStrategies: Record<
  string,
  (a: LeaderboardMember, b: LeaderboardMember) => number
> = {
  score: (a, b) => (b.s || 0) - (a.s || 0),
  trend: (a, b) => (b.dt || 0) - (a.dt || 0),
  trophies: (a, b) => (b.t || 0) - (a.t || 0),
  name: (a, b) => a.n.localeCompare(b.n),
  donations_day: (a, b) => (b.d.avg || 0) - (a.d.avg || 0),
  tenure: (a, b) => (b.d.days || 0) - (a.d.days || 0),
  last_seen: (a, b) =>
    parseTimeAgoValue(a.d.seen) - parseTimeAgoValue(b.d.seen),
};

const {
  searchQuery,
  sortBy,
  visibleItems,
  expandedIds,
  selectedIds,
  selectedSet,
  fabState,
  isSelectionMode,
  status,
  statsBadge,
  showSkeletons,
  filteredItems,
  updateSort,
  toggleSelect,
  toggleExpand,
  clearSelection,
  handleAction,
  handleBlitz,
  handleSelectAll,
  handleSelectScore,
} = useConsoleLogic({
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
  statsLabel: "Clan",
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

// Specific Helper for Score Selection
function onSelectScore(threshold: number, mode: "ge" | "le") {
  handleSelectScore(threshold, mode, (m) => m.s || 0);
}

function handleSearch(val: string) {
  searchQuery.value = val;
}
</script>

<template>
  <ConsoleLayout
    title="Leaderboard"
    :status="status"
    :show-search="true"
    :sheet-url="sheetUrl"
    :stats="statsBadge"
    :sort-options="sortOptions"
    :current-sort="sortBy"
    :loading="showSkeletons"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :is-refreshing="isRefreshing"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="handleSearch"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="onSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="clearSelection"
  >
    <!-- Default Slot: The List -->
    <MemberCard
      v-for="(member, index) in visibleItems"
      :key="member.id"
      v-memo="[
        member.s,
        member.dt,
        expandedIds.has(member.id),
        selectedSet.has(member.id),
        isSelectionMode,
        isRefreshing,
      ]"
      :id="`member-${member.id}`"
      :member="member"
      :expanded="expandedIds.has(member.id)"
      :selected="selectedSet.has(member.id)"
      :selection-mode="isSelectionMode"
      :style="{ '--i': index }"
      :app-is-refreshing="isRefreshing"
      @toggle="toggleExpand(member.id)"
      @toggle-select="toggleSelect(member.id)"
    />
  </ConsoleLayout>
</template>
