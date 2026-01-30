<script setup lang="ts">
import { useRecruiter } from "../composables/useRecruiter";

import RecruitCard from "../components/RecruitCard.vue";
import RecruitCardSkeleton from "../components/RecruitCardSkeleton.vue";
import Icon from "../components/Icon.vue";
import ConsoleLayout from "../components/ConsoleLayout.vue";

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
  handleRefresh,
  handleSearchUpdate,
  updateSort,
  handleSelectAll,
  clearSelection,
  onSelectScore,
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
    :loading="isRefreshing && !isHydrated"
    :skeleton-component="RecruitCardSkeleton"
    :is-selection-mode="isSelectionMode"
    :selected-count="selectedIds.length"
    :total-count="filteredItems.length"
    :is-refreshing="isRefreshing || isTurboScanning"
    :sync-error="syncError"
    :is-empty="!showSkeletons && filteredItems.length === 0"
    :fab-state="fabState"
    @refresh="handleRefresh"
    @update:search="handleSearchUpdate"
    @update:sort="updateSort"
    @select-all="handleSelectAll"
    @clear-selection="clearSelection"
    @select-score="onSelectScore"
    @fab-action="handleAction"
    @fab-blitz="handleBlitz"
    @fab-dismiss="dismissBulk"
  >
    <!-- Custom Empty Action for Recruit View -->
    <template #empty-action>
      <button class="btn-primary" @click="handleRefresh">
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
        @toggle-expand="toggleExpand(visibleItems[0].id)"
        @toggle-select="toggleSelect(visibleItems[0].id)"
      />
      <RecruitCardSkeleton v-for="i in 7" :key="'ex-' + i" />
    </template>
    <template v-else>
      <RecruitCard
        v-for="(recruit, index) in visibleItems"
        :key="recruit.id"
        v-memo="[
          recruit.potentialScore,
          recruit.t,
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
        @toggle-expand="toggleExpand(recruit.id)"
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
