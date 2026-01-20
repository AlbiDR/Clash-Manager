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
    <!-- Left: Status Cluster -->
    <div class="sel-status" :class="{ 'hide-on-expand': isScoreExpanded }">
      <div class="indicator-ring">
        <div class="indicator-dot" :class="{ active: isActive }"></div>
      </div>
      <span class="status-label">
        {{ isActive ? `${count} Selected` : "Multi-Select" }}
      </span>
    </div>

    <!-- Center: Primary Actions -->
    <div class="sel-actions">
      <!-- Standard Chips (Hidden when score picker is fully expanded on small screens if needed) -->
      <template v-if="!isScoreExpanded">
        <button
          class="action-pill"
          @click="$emit('select-all')"
          title="Select All"
        >
          <Icon name="select_all" size="16" />
          <span class="pill-text">All</span>
        </button>

        <button
          class="action-pill"
          :class="{ dimmed: !isActive }"
          @click="$emit('clear')"
          :disabled="!isActive"
          title="Clear Selection"
        >
          <Icon name="layers_clear" size="16" />
          <span class="pill-text">None</span>
        </button>

        <div class="v-sep"></div>
      </template>

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
    </div>

    <!-- Right: Done Button -->
    <Transition name="slide-done">
      <button
        v-if="isActive && !isScoreExpanded"
        class="done-action"
        @click="$emit('done')"
      >
        <Icon name="check" size="18" />
        <span>Done</span>
      </button>
    </Transition>

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
  border-radius: 14px;
  gap: 8px;
  transition: all 0.4s var(--sys-motion-spring);
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}

.selection-bar.is-active {
  background: var(--sys-color-surface-container-high);
  box-shadow: inset 0 0 0 1px rgba(var(--sys-color-primary-rgb), 0.15);
}

.sel-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  flex-shrink: 0;
  transition:
    opacity 0.3s,
    width 0.3s;
}

.indicator-ring {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--sys-color-outline-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.is-active .indicator-ring {
  border-color: var(--sys-color-primary);
  background: var(--sys-color-primary-container);
}

.indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: transparent;
  transition: all 0.4s var(--sys-motion-spring);
  transform: scale(0);
}

.indicator-dot.active {
  background: var(--sys-color-primary);
  transform: scale(1);
}

.status-label {
  font-size: 13px;
  font-weight: 850;
  color: var(--sys-color-on-surface-variant);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.is-active .status-label {
  color: var(--sys-color-on-surface);
}

.sel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-width: 0;
}
.sel-actions::-webkit-scrollbar {
  display: none;
}

.action-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: none;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.action-pill:active:not(:disabled) {
  transform: scale(0.94);
}

.action-pill.dimmed {
  opacity: 0.4;
  filter: grayscale(1);
  cursor: default;
}

.v-sep {
  width: 1px;
  height: 16px;
  background: var(--sys-color-outline-variant);
  margin: 0 4px;
  flex-shrink: 0;
}

/* 🧪 DYNAMIC SCORE PILL GROUP */
.score-pill-group {
  display: flex;
  align-items: center;
  background: var(--sys-color-surface-container-highest);
  border-radius: 14px;
  padding: 3px;
  gap: 2px;
  transition: all 0.4s var(--sys-motion-spring);
  flex-shrink: 0;
  border: 1px solid transparent;
  min-width: 90px;
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
  border-radius: 10px;
  border: none;
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.2s,
    transform 0.2s;
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
  gap: 6px;
  padding: 0 8px;
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
  opacity: 0.6;
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
  animation: slideIn 0.3s ease;
}
.value-picker::-webkit-scrollbar {
  display: none;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.val-opt {
  height: 28px;
  min-width: 36px;
  padding: 0 6px;
  border-radius: 8px;
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
  border-radius: 10px;
  padding: 0 10px;
  height: 30px;
  font-weight: 950;
  font-size: 10px;
  font-family: var(--sys-font-family-mono);
  margin-left: 2px;
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
  padding: 0 14px;
  height: 36px;
  font-weight: 900;
  font-size: 13px;
  cursor: pointer;
  box-shadow: var(--sys-elevation-2);
  transition: all 0.3s var(--sys-motion-spring);
  margin-right: 4px;
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

/* Mobile Responsiveness */
@media (max-width: 480px) {
  .hide-on-expand {
    opacity: 0;
    width: 0;
    padding: 0;
    margin: 0;
    pointer-events: none;
  }
}

/* Transitions */
.slide-done-enter-active,
.slide-done-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}

.slide-done-enter-from {
  opacity: 0;
  transform: translateX(20px) scale(0.9);
}

.slide-done-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
