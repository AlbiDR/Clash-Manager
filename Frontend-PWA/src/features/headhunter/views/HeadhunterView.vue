import { BaseCardSkeleton, Icon , ConsoleLayout, ConsoleHeader, FloatingDock, HeaderInfoOverlay } from "@shared";
<script setup lang="ts">
import { useRecruiter } from "../composables/useRecruiter";

import RecruitCard from "../components/RecruitCard.vue";


const {
  status,
  sheetUrl,
  statsBadge,
  sortOptions,
  sortBy,
  isRefreshing,
  isHydrated,
  isTurboScanning,
  isSelectionMode,
  selectedIds,
  filteredItems,
  syncError,
  showSkeletons,
  fabState,
  visibleItems,
  expandedIds,
  selectedSet,
  isShowcaseMode,
  refresh,
  handleSearch,
  updateSort,
  handleSelectAll,
  clearSelection,
  handleSelectScore,
  handleAction,
  handleBlitz,
  dismissBulk,
  toggleExpand,
  toggleSelect,
} = useRecruiter();
</script>

<template>
  <ConsoleLayout
    title="Headhunter"
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
    :is-refreshing="isRefreshing || isTurboScanning"
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
    @fab-dismiss="dismissBulk"
  >
    <!-- Custom Empty Action for Recruit View -->
    <template #empty-action>
      <button class="btn-primary" @click="refresh">
        <Icon name="refresh" size="18" />
        <span>Scan Again</span>
      </button>
    </template>
    <!-- Default Slot: The List -->
    <!-- Exhibition Row (Only 1 card + skeletons if specialized) -->
    <template v-if="isShowcaseMode">
      <RecruitCard
        v-if="visibleItems.length > 0"
        :recruit="visibleItems[0]"
        :expanded="expandedIds.has(visibleItems[0].id)"
        :selected="selectedSet.has(visibleItems[0].id)"
        :selection-mode="isSelectionMode"
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
      <RecruitCard
        v-for="(recruit, index) in visibleItems"
        :key="recruit.id"
        v-memo="[
          recruit.potentialScore,
          recruit.t,
          recruit.d.ago,
          expandedIds.has(recruit.id),
          selectedSet.has(recruit.id),
          isSelectionMode,
          expandedIds.has(recruit.id) && isRefreshing,
        ]"
        :id="`recruit-${recruit.id}`"
        :recruit="recruit"
        :expanded="expandedIds.has(recruit.id)"
        :selected="selectedSet.has(recruit.id)"
        :selection-mode="isSelectionMode"
        :style="{ '--i': index }"
        :app-is-refreshing="isRefreshing"
        @toggle="toggleExpand(recruit.id)"
        @toggle-select="toggleSelect(recruit.id)"
      />
    </template>
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 99px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 16px;
  transition: transform 0.2s;
}
.btn-primary:active {
  transform: scale(0.95);
}
</style>
