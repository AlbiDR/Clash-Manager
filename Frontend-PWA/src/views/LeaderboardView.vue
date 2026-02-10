import { BaseCardSkeleton } from "@shared";
<script setup lang="ts">
import { useLeaderboard } from "../composables/useLeaderboard";

import MemberCard from "../components/MemberCard.vue";
import ConsoleLayout from "../components/ConsoleLayout.vue";

const {
  // Data & Status
  data,
  isRefreshing,
  syncError,
  sheetUrl,
  status,
  statsBadge,
  showSkeletons,
  isShowcaseMode,

  // List State
  visibleItems,
  filteredItems,
  expandedIds,
  selectedIds,
  selectedSet,
  isSelectionMode,
  fabState,

  // Config
  sortBy,
  sortOptions,

  // Actions
  refresh,
  handleSearch,
  updateSort,
  toggleExpand,
  toggleSelect,
  clearSelection,
  handleSelectAll,
  handleSelectScore,
  handleAction,
  handleBlitz,
} = useLeaderboard();
</script>

<template>
  <ConsoleLayout
    title="Roster"
    :status="status"
    :show-search="true"
    :sheet-url="sheetUrl"
    :stats="statsBadge"
    :sort-options="sortOptions"
    :current-sort="sortBy"
    :loading="showSkeletons"
    :skeleton-component="BaseCardSkeleton"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :total-count="filteredItems.length"
    :is-refreshing="isRefreshing"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="refresh"
    @update:search="handleSearch"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="handleSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="clearSelection"
  >
    <!-- Default Slot: The List -->
    <!-- Exhibition Row (Only 1 card + skeletons if specialized) -->
    <template v-if="isShowcaseMode">
      <MemberCard
        v-if="visibleItems.length > 0"
        :member="visibleItems[0]"
        :expanded="expandedIds.has(visibleItems[0].id)"
        :selected="selectedSet.has(visibleItems[0].id)"
        :selection-mode="isSelectionMode"
        :is-tagged="data?.playerTag === visibleItems[0].id"
        :app-is-refreshing="isRefreshing"
        @toggle="toggleExpand(visibleItems[0].id)"
        @toggle-select="toggleSelect(visibleItems[0].id)"
      />
      <BaseCardSkeleton
        v-for="i in 7"
        :key="'ex-' + i"
        :index="i + 1"
        :style="{ '--i': i + 1 }"
      />
    </template>
    <template v-else>
      <MemberCard
        v-for="(member, index) in visibleItems"
        :key="member.id"
        v-memo="[
          member.performanceScore,
          member.dt,
          expandedIds.has(member.id),
          selectedSet.has(member.id),
          isSelectionMode,
          expandedIds.has(member.id) && isRefreshing,
          data?.playerTag === member.id,
        ]"
        :id="`member-${member.id}`"
        :member="member"
        :expanded="expandedIds.has(member.id)"
        :selected="selectedSet.has(member.id)"
        :selection-mode="isSelectionMode"
        :is-tagged="data?.playerTag === member.id"
        :style="{ '--i': index }"
        :app-is-refreshing="isRefreshing"
        @toggle="toggleExpand(member.id)"
        @toggle-select="toggleSelect(member.id)"
      />
    </template>
  </ConsoleLayout>
</template>
