<script setup lang="ts">
import { computed } from "vue"; // Removed unused onUmounted and watch
import ConsoleHeader from "./ConsoleHeader.vue";
import SelectionBar from "./SelectionBar.vue";
import PullToRefresh from "./PullToRefresh.vue";
import EmptyState from "./EmptyState.vue";
import ErrorState from "./ErrorState.vue";
import SkeletonCard from "./SkeletonCard.vue";
import FabIsland from "./FabIsland.vue";
import { useUiCoordinator } from "../composables/useUiCoordinator";
import { watch, onUnmounted } from "vue";

const props = defineProps<{
  // Wrapper for ConsoleHeader props
  title: string;
  status: { type: "updated" | "error" | "loading" | "ready"; text: string };
  showSearch?: boolean;
  sheetUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string }[];
  loading?: boolean;

  // Selection/Fab state
  isSelectionMode?: boolean;
  selectedCount?: number;
  currentSort?: string;
  isRefreshing?: boolean;

  // Sync Status
  syncError?: string;
  isEmpty?: boolean;

  // FAB Props
  fabState?: {
    visible: boolean;
    label: string;
    actionHref?: string;
    isProcessing: boolean;
    isBlasting: boolean;
    selectionCount: number;
    blitzEnabled: boolean;
  };
}>();

const emit = defineEmits<{
  refresh: [];
  "update:search": [string];
  "update:sort": [string];
  "select-all": [];
  "select-score": [number, string]; // Assuming threshold and mode
  "clear-selection": [];
  "fab-action": [MouseEvent];
  "fab-blitz": [];
  "fab-dismiss": [];
  // We need to re-emit these from ConsoleHeader if they are used there
}>();

// FAB Visibility Logic
const { setFabVisible } = useUiCoordinator();
if (props.fabState) {
  watch(
    () => props.fabState.visible,
    (visible: boolean) => setFabVisible(!!visible),
  );
  onUnmounted(() => setFabVisible(false));
}
</script>

<template>
  <div class="view-container">
    <PullToRefresh @refresh="$emit('refresh')" />

    <ConsoleHeader
      :title="title"
      :status="status"
      :show-search="showSearch"
      :sheet-url="sheetUrl"
      :stats="stats"
      :sort-options="sortOptions"
      :current-sort="currentSort"
      :loading="loading"
      @update:search="(val) => $emit('update:search', val)"
      @update:sort="(val) => $emit('update:sort', val)"
      @refresh="$emit('refresh')"
    >
      <template #extra>
        <SelectionBar
          v-if="isSelectionMode"
          :count="selectedCount || 0"
          :loading="isRefreshing"
          @select-all="$emit('select-all')"
          @clear="$emit('clear-selection')"
          @done="$emit('clear-selection')"
          @select-score="(t, m) => $emit('select-score', t, m)"
        />
        <slot name="extra-header" v-else></slot>
      </template>
    </ConsoleHeader>

    <!-- Error State -->
    <ErrorState
      v-if="syncError && isEmpty"
      :message="syncError"
      @retry="$emit('refresh')"
    />

    <!-- Loading State (Skeletons) -->
    <div v-else-if="loading" class="list-container gpu-contain">
      <SkeletonCard
        v-for="(n, i) in 8"
        :key="i"
        :index="i"
        :style="{ '--i': i }"
      />
    </div>

    <!-- Empty State -->
    <EmptyState v-else-if="isEmpty" icon="telescope" message="No items found">
      <template #action>
        <slot name="empty-action"></slot>
      </template>
    </EmptyState>

    <!-- Content State -->
    <div v-else v-auto-animate class="list-container gpu-contain">
      <slot></slot>
    </div>

    <!-- FAB -->
    <FabIsland
      v-if="fabState"
      :visible="fabState.visible"
      :label="fabState.label"
      :action-href="fabState.actionHref"
      :dismiss-label="
        fabState.isProcessing
          ? 'Exit'
          : title === 'Headhunter'
            ? 'Dismiss'
            : 'Clear'
      "
      :is-processing="fabState.isProcessing"
      :is-blasting="fabState.isBlasting"
      :selection-count="fabState.selectionCount"
      :blitz-enabled="fabState.blitzEnabled"
      @action="(x) => $emit('fab-action', x)"
      @blitz="$emit('fab-blitz')"
      @dismiss="$emit('fab-dismiss')"
    />
  </div>
</template>

<style scoped>
.view-container {
  min-height: 100%;
  padding-bottom: 24px;
}
.list-container {
  padding-bottom: 32px;
  position: relative;
  min-height: 60vh;
}
.gpu-contain {
  transform: translateZ(0);
  will-change: transform;
  contain: layout paint;
}
</style>
