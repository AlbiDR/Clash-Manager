<script setup lang="ts">
import { ref, computed } from "vue";
import Icon from "./Icon.vue";
import { useHaptics } from "../composables/useHaptics";

const props = defineProps<{
  count: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "select-all"): void;
  (e: "clear"): void;
  (e: "done"): void;
  (e: "select-score", threshold: number, mode: "ge" | "le"): void;
}>();

const haptics = useHaptics();

// UI State
const isScoreExpanded = ref(false);
const isActive = computed(() => props.count > 0);

// Dynamic Filter State
const filterMode = ref<"ge" | "le">("ge");
const filterValue = ref(75);

// Pre-calculated options for the "clinical-OCD" horizontal picker
const thresholds = [0, 10, 20, 30, 40, 50, 60, 70, 75, 80, 90, 100];

function toggleMode() {
  filterMode.value = filterMode.value === "ge" ? "le" : "ge";
  haptics.tap();
  applyFilter();
}

function selectValue(val: number) {
  if (filterValue.value === val) return;
  filterValue.value = val;
  haptics.medium();
  applyFilter();
}

function applyFilter() {
  emit("select-score", filterValue.value, filterMode.value);
}

function toggleExpand() {
  isScoreExpanded.value = !isScoreExpanded.value;
  haptics.tap();
  if (isScoreExpanded.value) {
    // Proactively apply current filter when expanding if it's the main interaction
    applyFilter();
  }
}
</script>

<template>
  <div
    class="selection-bar animate-pop"
    :class="{ 'is-active': isActive, 'is-loading': loading }"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <!-- Left Cluster: Strategy & Selection Tools -->
    <div class="sel-group strategy">
      <!-- Score Dynamic Selector -->
      <div class="score-pill-group" :class="{ expanded: isScoreExpanded }">
        <!-- Comparison Mode Toggle -->
        <button
          class="mode-toggle"
          @click="toggleMode"
          :title="
            filterMode === 'ge' ? 'Greater than or equal' : 'Less than or equal'
          "
        >
          <span class="mode-symbol">{{ filterMode === "ge" ? "≥" : "≤" }}</span>
        </button>

        <!-- Main Trigger / Label -->
        <button class="sp-trigger" @click="toggleExpand">
          <span class="sp-label">{{ filterValue }}</span>
          <span class="sp-chevron" :class="{ rotated: isScoreExpanded }">
            <Icon name="chevron_down" size="14" />
          </span>
        </button>

        <!-- Dynamic Value Picker (Horizontal Scroll) -->
        <div v-if="isScoreExpanded" class="value-picker">
          <button
            v-for="val in thresholds"
            :key="val"
            class="val-opt"
            :class="{ active: filterValue === val }"
            @click="selectValue(val)"
          >
            {{ val }}
          </button>
        </div>

        <!-- Quick "Pro" Shortcut (Visible when not expanded) -->
        <button
          v-if="!isScoreExpanded"
          class="sp-opt primary"
          @click="selectValue(75)"
        >
          75+
        </button>
      </div>

      <!-- Select All Action (Always visible) -->
      <button
        v-if="!isScoreExpanded"
        class="action-pill strategy-pill"
        @click="$emit('select-all')"
        title="Select All"
      >
        <Icon name="select_all" size="16" />
        <span class="pill-text">All</span>
      </button>
    </div>

    <!-- Center Cluster: Status Indicator (Active Only) -->
    <div class="sel-group status">
      <Transition name="status-pop">
        <div v-if="isActive && !isScoreExpanded" class="active-status">
          <div class="status-badge">{{ count }}</div>
          <span class="status-text">Selected</span>
        </div>
      </Transition>
    </div>

    <!-- Right Cluster: Management & Done -->
    <div class="sel-group management">
      <TransitionGroup name="slide-right">
        <button
          v-if="isActive && !isScoreExpanded"
          key="none"
          class="action-pill alt-pill"
          @click="$emit('clear')"
          title="Clear Selection"
        >
          <Icon name="deselect_all" size="16" />
          <span class="pill-text">None</span>
        </button>

        <button
          v-if="isActive && !isScoreExpanded"
          key="done"
          class="done-action"
          @click="$emit('done')"
        >
          <Icon name="check" size="18" />
          <span>Done</span>
        </button>
      </TransitionGroup>
    </div>

    <!-- Skeleton Overlays -->
    <div v-if="loading" class="loading-overlay">
      <div class="sk-line skeleton-anim"></div>
    </div>
  </div>
</template>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 48px;
  padding: 0 4px;
  background: var(
    --sys-color-surface-container-low,
    var(--sys-color-surface-container)
  );
  border-radius: 16px;
  gap: 8px;
  transition: all 0.4s var(--sys-motion-spring);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.selection-bar.is-active {
  background: var(--sys-color-surface-container-high);
  box-shadow: inset 0 0 0 1px rgba(var(--sys-color-primary-rgb), 0.12);
}

.sel-group {
  display: flex;
  align-items: center;
  height: 100%;
}

.sel-group.strategy {
  flex: 1;
  gap: 6px;
  min-width: 0;
}

.sel-group.status {
  flex: 1;
  justify-content: center;
  pointer-events: none;
}

.sel-group.management {
  flex: 1;
  justify-content: flex-end;
  gap: 6px;
}

.action-pill {
  height: 32px;
  padding: 0 10px;
  border-radius: 10px;
  border: none;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 850;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  border: 1px solid var(--sys-color-outline-variant);
}

.action-pill:active {
  transform: scale(0.94);
}

.strategy-pill {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border-color: rgba(var(--sys-color-secondary-rgb), 0.1);
}

.alt-pill {
  background: var(--sys-color-surface-container-high);
  opacity: 0.8;
}

.active-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  border-radius: 10px;
  font-family: var(--sys-font-family-mono);
}

.status-badge {
  font-weight: 900;
  font-size: 13px;
}

.status-text {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.8;
}

/* 🧪 DYNAMIC SCORE PILL GROUP */
.score-pill-group {
  display: flex;
  align-items: center;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
  transition: all 0.4s var(--sys-motion-spring);
  flex-shrink: 0;
  border: 1px solid var(--sys-color-outline-variant);
  min-width: 84px;
}

.score-pill-group.expanded {
  background: var(--sys-color-surface-container-high);
  border-color: var(--sys-color-primary);
  flex: 1;
  min-width: 0;
}

.mode-toggle {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: none;
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-toggle:active {
  transform: scale(0.85) rotate(-15deg);
}

.mode-symbol {
  font-size: 16px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

.sp-trigger {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  height: 30px;
  color: var(--sys-color-on-surface);
  cursor: pointer;
}

.sp-label {
  font-size: 14px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  min-width: 24px;
  text-align: center;
}

.sp-chevron {
  transition: transform 0.3s var(--sys-motion-spring);
  display: flex;
  opacity: 0.4;
}

.sp-chevron.rotated {
  transform: rotate(180deg);
}

/* Value Picker */
.value-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
}

.value-picker::-webkit-scrollbar {
  display: none;
}

.val-opt {
  height: 28px;
  min-width: 36px;
  padding: 0 6px;
  border-radius: 7px;
  border: none;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  font-size: 11px;
  font-weight: 850;
  font-family: var(--sys-font-family-mono);
  cursor: pointer;
  transition: all 0.2s;
}

.val-opt.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  transform: scale(1.05);
}

.sp-opt.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 9px;
  padding: 0 8px;
  height: 30px;
  font-weight: 950;
  font-size: 10px;
  font-family: var(--sys-font-family-mono);
}

/* Done Action */
.done-action {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 34px;
  font-weight: 900;
  font-size: 12px;
  cursor: pointer;
  box-shadow: var(--sys-elevation-1);
  transition: all 0.2s;
  flex-shrink: 0;
}

.done-action:active {
  transform: scale(0.92);
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: var(--sys-color-surface-container-low);
  display: flex;
  align-items: center;
  padding: 0 16px;
  z-index: 10;
}

/* Transitions */
.status-pop-enter-active {
  animation: popIn 0.4s var(--sys-motion-spring);
}
.status-pop-leave-active {
  animation: popIn 0.3s var(--sys-motion-spring) reverse;
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(30px) scale(0.9);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

@media (max-width: 600px) {
  .strategy {
    flex: 2;
  }
  .status {
    flex: 0.5;
  }
  .status-text {
    display: none;
  }
}
</style>
