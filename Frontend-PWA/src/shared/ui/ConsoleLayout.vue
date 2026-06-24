<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick, toRef, computed } from "vue";
import {
  useUiCoordinator,
  useShowcaseMode,
  useBlueprintMode,
  useSystemInfo,
} from "@core";
import { useHaptics } from "../composables/useHaptics";
import { usePullToRefresh } from "../index";
import ConsoleHeader from "./ConsoleHeader.vue";
import EmptyState from "./EmptyState.vue";
import ErrorState from "./ErrorState.vue";
import Icon from "./Icon.vue";
import SelectionBar from "./SelectionBar.vue";
import AppFooter from "./AppFooter.vue";
import BaseCardSkeleton from "./BaseCardSkeleton.vue";

const props = defineProps<{
  title: string;
  status: {
    type: "success" | "warning" | "error" | "loading";
    text: string;
    nominal?: boolean;
  };
  showSearch?: boolean;
  stats?: { label: string; value: string };
  sortOptions?: { label: string; value: string; desc?: string }[];
  loading?: boolean;
  isSelectionMode?: boolean;
  selectedCount?: number;
  currentSort?: string;
  isRefreshing?: boolean;
  syncError?: string;
  isEmpty?: boolean;
  /** Primary message displayed when the view has no data. */
  emptyMessage?: string;
  /** Supporting hint or action description for the empty state. */
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
    isHarvesting?: boolean;
    activeHarvester?: "global" | "local" | null;
  };
  skeletonComponent?: any;
  skeletonCount?: number;
  totalCount?: number;
  /** Consolidated info about the remote data source. */
  remoteInfo?: {
    source: "SUPABASE";
    dataAge: string | null;
  };
  footerBadge?: string;
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
  "fab-global-harvest": [];
  "fab-local-harvest": [];
  "fab-abort-harvest": [];
}>();

const { setFabVisible, updateFabState } = useUiCoordinator();
const haptics = useHaptics();
const { isShowcaseMode } = useShowcaseMode();
const { isBlueprintMode } = useBlueprintMode();
const { appVersion, activeBadge } = useSystemInfo();

const activeFooterBadge = computed(() => {
  if (props.footerBadge !== undefined) return props.footerBadge;
  return activeBadge.value || undefined;
});

const displayLoading = computed(() => {
  if (isShowcaseMode.value) return false;
  return props.loading || isBlueprintMode.value;
});

const { isPulling, ptrStyle, onTouchStart, onTouchMove, onTouchEnd } =
  usePullToRefresh({
    isRefreshing: toRef(props, "isRefreshing"),
    onRefresh: () => emit("refresh"),
  });

// [SYNC] FAB SYNCHRONIZATION
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
        isHarvesting: state.isHarvesting,
        activeHarvester: state.activeHarvester,
        dismissIcon: state.dismissIcon,
        onAction: (e: MouseEvent) => emit("fab-action", e),
        onBlitz: () => emit("fab-blitz"),
        onDismiss: () => emit("fab-dismiss"),
        onGlobalHarvest: () => emit("fab-global-harvest"),
        onLocalHarvest: () => emit("fab-local-harvest"),
        onAbortHarvest: () => emit("fab-abort-harvest"),
      });

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
        :class="{ 'is-refreshing': props.isRefreshing, 'is-pulling': isPulling }"
      >
        <div class="ptr-spinner">
          <Icon
            v-if="!props.isRefreshing"
            name="refresh"
            size="18"
            class="ptr-icon"
          />
        </div>
      </div>

      <ConsoleHeader
        :title="props.title"
        :status="props.status"
        :show-search="props.showSearch"
        :stats="props.stats"
        :sort-options="props.sortOptions"
        :current-sort="props.currentSort"
        :loading="displayLoading"
        :remote-info="props.remoteInfo"
        reserve-extra-space
        @update:search="(val: string) => emit('update:search', val)"
        @update:sort="(val: string) => emit('update:sort', val)"
        @refresh="emit('refresh')"
      >
        <template #filters>
          <slot name="header-filters"></slot>
        </template>
        <template #extra>
          <SelectionBar
            v-if="props.selectedCount !== undefined"
            :count="props.selectedCount"
            :total-count="props.totalCount || 0"
            :loading="displayLoading"
            @select-all="emit('select-all')"
            @clear="emit('clear-selection')"
            @done="emit('clear-selection')"
            @select-score="
              (t: number, m: 'ge' | 'le') => emit('select-score', t, m)
            "
          />
          <slot name="extra-header" v-else></slot>
        </template>
      </ConsoleHeader>
      
      <!-- Persistent Top Content -->
      <slot name="top"></slot>

      <!-- Error State -->
      <ErrorState
        v-if="props.syncError && props.isEmpty"
        :message="props.syncError"
        @retry="emit('refresh')"
      />

      <!-- Loading State (Skeletons) -->
      <div v-else-if="displayLoading" class="list-container gpu-contain">
        <component
          :is="props.skeletonComponent || BaseCardSkeleton"
          v-for="i in (props.skeletonCount || 8)"
          :key="i"
          :index="i"
          :style="{ '--i': i }"
        />
      </div>

      <!-- Empty State -->
      <EmptyState
        v-else-if="props.isEmpty"
        :icon="props.emptyIcon || 'telescope'"
        :message="props.emptyMessage || 'No items found'"
        :hint="props.emptyHint"
      >
        <template #action>
          <slot name="empty-action"></slot>
        </template>
      </EmptyState>

      <!-- Content State -->
      <div v-else class="list-container gpu-contain">
        <slot></slot>
      </div>

      <AppFooter
        :version="appVersion"
        :badge="activeFooterBadge"
      />
    </div>
  </div>
</template>

<style scoped>
.view-container {
  min-height: 100%;
  padding-bottom: calc(112px + env(safe-area-inset-bottom));
}
.view-content {
  transition: transform var(--sys-motion-duration-200) var(--sys-motion-spring);
}
.view-content.is-pulling {
  transform: translateY(calc(var(--ptr-offset, 0px) / 2));
}
.list-container {
  padding-bottom: var(--sys-space-48);
  position: relative;
}
.gpu-contain {
  contain: layout;
}
.ptr-indicator {
  position: absolute;
  top: calc(-1 * var(--sys-space-48));
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--sys-z-sticky);
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--sys-space-40);
  height: var(--sys-space-40);
  border-radius: 50%;
  background: var(--sys-color-surface-container);
  border: 1px solid var(--sys-color-outline-variant);
  opacity: 0;
  transition: opacity var(--sys-motion-duration-200) ease;
}

.is-pulling .ptr-indicator,
.is-refreshing .ptr-indicator {
  opacity: 1;
}

.ptr-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sys-color-primary);
}

.ptr-icon {
  transition: transform var(--sys-motion-duration-200) ease;
  transform: rotate(calc(var(--ptr-offset, 0px) * 2deg));
}

.is-refreshing .ptr-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
