<script setup lang="ts">
import { watch, onUnmounted } from "vue";
import ConsoleHeader from "./ConsoleHeader.vue";
import SelectionBar from "./SelectionBar.vue";
import EmptyState from "./EmptyState.vue";
import ErrorState from "./ErrorState.vue";
import SkeletonCard from "./SkeletonCard.vue";
import { useUiCoordinator } from "../composables/useUiCoordinator";

const props = defineProps<{
  title: string;
  status: { type: "updated" | "error" | "loading" | "ready"; text: string };
  showSearch?: boolean;
  sheetUrl?: string;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string }[];
  loading?: boolean;
  isSelectionMode?: boolean;
  selectedCount?: number;
  currentSort?: string;
  isRefreshing?: boolean;
  syncError?: string;
  isEmpty?: boolean;
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
  "select-score": [number, string];
  "clear-selection": [];
  "fab-action": [MouseEvent];
  "fab-blitz": [];
  "fab-dismiss": [];
}>();

const { setFabVisible, updateFabState } = useUiCoordinator();

// Sync fabState visibility with global coordinator
watch(
  () => props.fabState?.visible,
  (visible) => {
    setFabVisible(!!visible);
  },
  { immediate: true }
);

// Sync fabState content with global coordinator
watch(
  () => props.fabState,
  (state) => {
    if (state) {
      updateFabState({
        label: state.label,
        actionHref: state.actionHref,
        isProcessing: state.isProcessing,
        isBlasting: state.isBlasting,
        selectionCount: state.selectionCount,
        blitzEnabled: state.blitzEnabled,
        onAction: (e: MouseEvent) => emit("fab-action", e),
        onBlitz: () => emit("fab-blitz"),
        onDismiss: () => emit("fab-dismiss"),
      });
    }
  },
  { immediate: true, deep: true }
);

onUnmounted(() => {
  setFabVisible(false);
});
</script>

<template>
  <div class="view-container">


    <ConsoleHeader
      :title="props.title"
      :status="props.status"
      :show-search="props.showSearch"
      :sheet-url="props.sheetUrl"
      :stats="props.stats"
      :sort-options="props.sortOptions"
      :current-sort="props.currentSort"
      :loading="props.loading"
      @update:search="(val: string) => emit('update:search', val)"
      @update:sort="(val: string) => emit('update:sort', val)"
      @refresh="emit('refresh')"
    >
      <template #extra>
        <SelectionBar
          v-if="props.isSelectionMode"
          :count="props.selectedCount || 0"
          :loading="props.isRefreshing"
          @select-all="emit('select-all')"
          @clear="emit('clear-selection')"
          @done="emit('clear-selection')"
          @select-score="(t: number, m: string) => emit('select-score', t, m)"
        />
        <slot name="extra-header" v-else></slot>
      </template>
    </ConsoleHeader>

    <!-- Error State -->
    <ErrorState
      v-if="props.syncError && props.isEmpty"
      :message="props.syncError"
      @retry="emit('refresh')"
    />

    <!-- Loading State (Skeletons) -->
    <div v-else-if="props.loading" class="list-container gpu-contain">
      <SkeletonCard
        v-for="i in 8"
        :key="i"
        :index="i"
        :style="{ '--i': i }"
      />
    </div>

    <!-- Empty State -->
    <EmptyState v-else-if="props.isEmpty" icon="telescope" message="No items found">
      <template #action>
        <slot name="empty-action"></slot>
      </template>
    </EmptyState>

    <!-- Content State -->
    <div v-else v-auto-animate class="list-container gpu-contain">
      <slot></slot>
    </div>

    <!-- FAB is now rendered by FloatingDock -->
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
