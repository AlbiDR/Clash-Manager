import { BaseCardSkeleton, ConsoleLayout, ConsoleList } from "@shared";
<script setup lang="ts">
import { useLeaderboard } from "../composables/useLeaderboard";

import MemberCard from "../components/MemberCard.vue";


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
    <ConsoleList
      :items="visibleItems"
      :is-showcase-mode="isShowcaseMode"
    >
      <template #item="{ item, index }">
        <MemberCard
          :key="item.id"
          v-memo="[
            item.id,
            item.performanceScore,
            item.dt,
            expandedIds.has(item.id),
            selectedSet.has(item.id),
            isSelectionMode,
            expandedIds.has(item.id) && isRefreshing,
            data?.playerTag === item.id,
          ]"
          :id="`member-${item.id}`"
          :member="item"
          :expanded="expandedIds.has(item.id)"
          :selected="selectedSet.has(item.id)"
          :selection-mode="isSelectionMode"
          :is-tagged="data?.playerTag === item.id"
          :style="{ '--i': index }"
          :app-is-refreshing="isRefreshing"
          @toggle="toggleExpand(item.id)"
          @toggle-select="toggleSelect(item.id)"
        />
      </template>
    </ConsoleList>
  </ConsoleLayout>
</template>
