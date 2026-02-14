<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import ErrorState from "./ErrorState.vue";
import Icon from "./Icon.vue";
import SelectionBar from "./SelectionBar.vue";
import { useHaptics } from "../../core/services/useHaptics";
import { useUiCoordinator } from "../../core/services/useUiCoordinator";
import HeaderInfoOverlay from "./HeaderInfoOverlay.vue";
import { useShowcaseMode } from "../../core/services/useShowcaseMode";
import { ref, watch, onUnmounted, computed, nextTick } from "vue";
import ConsoleHeader from "./ConsoleHeader.vue";
import FloatingDock from "./FloatingDock.vue";
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

// --- Pull to Refresh Logic ---
const touchStartY = ref(0);
const touchStartX = ref(0);
const pullOffset = ref(0);
const threshold = 120;
const isPulling = ref(false);

const ptrStyle = computed(() => ({
  "--ptr-offset": `${Math.min(pullOffset.value, threshold)}px`,
  "--ptr-opacity": Math.min(pullOffset.value / 60, 1),
  "--ptr-rotate": `${pullOffset.value * 2}deg`,
}));

let hapticFeedbackTriggered = false;

function onTouchStart(e: TouchEvent) {
  if (window.scrollY > 0 || props.isRefreshing) return;
  touchStartY.value = e.touches[0].clientY;
  touchStartX.value = e.touches[0].clientX;
  isPulling.value = true;
  hapticFeedbackTriggered = false;
}

function onTouchMove(e: TouchEvent) {
  if (!isPulling.value) return;
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX; // Get current X position

  const rawDiff = Math.max(0, currentY - touchStartY.value); // Only allow pulling down
  const xDiff = Math.abs(currentX - touchStartX.value);

  // 🛡️ PTR PROTECTION: Ignore if moving sideways more than down (prevents stutter on diagonal scroll)
  if (xDiff > rawDiff * 0.5) {
    pullOffset.value = 0; // Reset pullOffset if predominantly horizontal
    isPulling.value = false; // Stop pulling
    return;
  }

  // Apply resistance (clamped logarithmic-like curve)
  // ⚡ ANDROID OPTIMIZATION: More sensitive curve (0.85 -> 0.9) to allow easier pull
  pullOffset.value = Math.pow(rawDiff, 0.9) * 2;

  // Haptic feedback when crossing threshold
  if (pullOffset.value >= threshold && !hapticFeedbackTriggered) {
    haptics.heavy();
    hapticFeedbackTriggered = true;
  } else if (pullOffset.value < threshold && hapticFeedbackTriggered) {
    hapticFeedbackTriggered = false;
  }
}

function onTouchEnd() {
  if (!isPulling.value) return;

  if (pullOffset.value >= threshold) {
    emit("refresh");
    haptics.success();
  }

  isPulling.value = false;
  pullOffset.value = 0;
}
// -----------------------------

// 🚀 FAB SYNCHRONIZATION
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
      // ⚡ FORCE UPDATE: Use nextTick to ensure the reactive state (step 1)
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
      <EmptyState v-else-if="isEmpty" icon="telescope" message="No items found">
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
  padding-bottom: 32px;
  position: relative;
}
.gpu-contain {
  transform: translateZ(0);
  will-change: transform;
  /* ⚡ PERFORMANCE: Removed 'paint' to allow shadows to bleed, kept layout */
  contain: layout;
}
.ptr-indicator {
  z-index: 50; /* Local layer priority */
}
</style>
