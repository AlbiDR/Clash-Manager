<script setup lang="ts">
import {
  Icon,
  ConsoleLayout,
  ConsoleList
} from "@shared";
import { useRecruiter } from "../composables/useRecruiter";

import RecruitCard from "../components/RecruitCard.vue";


const {
  sortOptions,
  isRefreshing,
  isTurboScanning,
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
  layoutProps,
} = useRecruiter();

</script>

<template>
  <ConsoleLayout
    title="Headhunter"
    v-bind="layoutProps"
    :show-search="true"
    :sort-options="sortOptions"
    :is-refreshing="isRefreshing || isTurboScanning"
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
  </ConsoleLayout>
</template>

<style scoped>
.btn-primary {
  margin-top: 16px;
}
</style>
