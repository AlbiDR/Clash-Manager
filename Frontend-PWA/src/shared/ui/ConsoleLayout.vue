<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import ErrorState from "./ErrorState.vue";
import Icon from "./Icon.vue";
import SelectionBar from "./SelectionBar.vue";
import {
  useHaptics,
  useUiCoordinator,
  useShowcaseMode,
} from "../../core";
import { ref, watch, onUnmounted, nextTick, toRef } from "vue";
import { usePullToRefresh } from "../index";
import ConsoleHeader from "./ConsoleHeader.vue";

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
  emptyMessage?: string;
  emptyHint?: string;
  emptyIcon?: string;
  fabState?: {
    visible: boolean;
    label: string;
    actionHref?: string;
    isProcessing: boolean;
    isBlasting: boolean;
    selectionCount: number;
    blitzEnabled: boolean;
  };
  skeletonComponent: any;
  totalCount?: number;
}>();

const emit = defineEmits<{
  refresh: [];
  "update:search": [string];
  "update:sort": [string];
  "select-all": [];
  "select-score": [threshold: number, mode: "ge" | "le"];
  "clear-selection": [];
  "fab-action": [MouseEvent];
  "fab-blitz": [];
  "fab-dismiss": [];
}>();

const { setFabVisible, updateFabState } = useUiCoordinator();
const haptics = useHaptics();
const { isShowcaseMode } = useShowcaseMode();

const { isPulling, ptrStyle, onTouchStart, onTouchMove, onTouchEnd } =
  usePullToRefresh({
    isRefreshing: toRef(props, "isRefreshing"),
    onRefresh: () => emit("refresh"),
  });

// [SYNC] FAB SYNCHRONIZATION
// We watch the entire fabState object to ensure strict ordering of updates.
// CRITICAL: We MUST update the content (label, etc.) BEFORE toggling visibility
// to prevent the "Open" -> "Open 1/N" text jump (twitch).
watch(
  () => props.fabState,
  (state) => {
    if (state) {
      // 1. Update Content First (Data)
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

      // 2. Toggle Visibility Second (UI)
      // This ensures the FAB is fully hydrated with correct text before appearing.
      // [PERF] FORCE UPDATE: Use nextTick to ensure the reactive state (step 1)
      // has fully propagated through the system before we flip the visibility switch.
      nextTick(() => {
        setFabVisible(!!state.visible);
      });
    } else {
      setFabVisible(false);
    }
  },
  { immediate: true, deep: true },
);

onUnmounted(() => {
  setFabVisible(false);
});
</script>

<template>
  <div class="view-container">
    <div
      class="view-content"
      :style="ptrStyle"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <!-- Pull to Refresh Indicator -->
      <div
        class="ptr-indicator"
        :class="{ 'is-refreshing': isRefreshing, 'is-pulling': isPulling }"
      >
        <div class="ptr-spinner">
          <Icon
            v-if="!isRefreshing"
            name="refresh"
            size="18"
            class="ptr-icon"
          />
        </div>
      </div>

      <ConsoleHeader
        :title="title"
        :status="status"
        :show-search="showSearch"
        :sheet-url="sheetUrl"
        :stats="stats"
        :sort-options="sortOptions"
        :current-sort="currentSort"
        :loading="loading"
        reserve-extra-space
        @update:search="(val: string) => $emit('update:search', val)"
        @update:sort="(val: string) => $emit('update:sort', val)"
        @refresh="$emit('refresh')"
      >
        <template #extra>
          <SelectionBar
            v-if="selectedCount !== undefined"
            :count="selectedCount"
            :total-count="totalCount || 0"
            :loading="loading"
            @select-all="$emit('select-all')"
            @clear="$emit('clear-selection')"
            @done="$emit('clear-selection')"
            @select-score="
              (t: number, m: string) => $emit('select-score', t, m)
            "
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
        <component
          :is="skeletonComponent"
          v-for="i in 8"
          :key="i"
          :index="i"
          :style="{ '--i': i }"
        />
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="isEmpty"
        :icon="emptyIcon || 'telescope'"
        :message="emptyMessage || 'No items found'"
        :hint="emptyHint"
      >
        <template #action>
          <slot name="empty-action"></slot>
        </template>
      </EmptyState>

      <!-- Content State -->
      <div v-else v-auto-animate class="list-container gpu-contain">
        <slot></slot>
      </div>
    </div>

    <!-- FAB is now rendered by FloatingDock -->
  </div>
</template>

<style scoped>
.view-container {
  min-height: 100%;
  padding-bottom: 24px;
}
.view-content {
  transition: transform 0.2s var(--sys-motion-spring);
}
.view-content.is-pulling {
  transform: translateY(calc(var(--ptr-offset, 0px) / 2));
  will-change: transform;
}
.list-container {
  padding-bottom: 120px;
  position: relative;
}
.gpu-contain {
  transform: translateZ(0);
  will-change: transform;
  /* [PERF] PERFORMANCE: Removed 'paint' to allow shadows to bleed, kept layout */
  contain: layout;
}
.ptr-indicator {
  z-index: 50; /* Local layer priority */
}
</style>
