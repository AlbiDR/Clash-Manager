<script setup lang="ts">
import {
  BaseCardSkeleton,
  Icon,
  ConsoleLayout,
  ConsoleList,
  AppFooter
} from "@shared";
import { useRecruiter } from "../composables/useRecruiter";
import { useBlueprintMode } from "@core";

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

const { isBlueprintMode } = useBlueprintMode();
const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";
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
    <ConsoleList
      :items="visibleItems"
      :is-showcase-mode="isShowcaseMode"
    >
      <template #item="{ item, index }">
        <RecruitCard
          :key="item.id"
          v-memo="[
            item.id,
            item.potentialScore,
            item.t,
            item.d.ago,
            expandedIds.has(item.id),
            selectedSet.has(item.id),
            isSelectionMode,
            expandedIds.has(item.id) && isRefreshing,
          ]"
          :id="`recruit-${item.id}`"
          :recruit="item"
          :expanded="expandedIds.has(item.id)"
          :selected="selectedSet.has(item.id)"
          :selection-mode="isSelectionMode"
          :style="{ '--i': index }"
          :app-is-refreshing="isRefreshing"
          @toggle="toggleExpand(item.id)"
          @toggle-select="toggleSelect(item.id)"
        />
      </template>
    </ConsoleList>

    <AppFooter 
      :version="appVersion" 
      :badge="isBlueprintMode ? 'BLUEPRINT' : undefined" 
    />
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary {
  margin-top: 16px;
}
</style>
