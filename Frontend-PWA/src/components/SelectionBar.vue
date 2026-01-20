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
const thresholds = [15, 30, 45, 60, 75, 90, 100];

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
      </div>
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

    <!-- Right Cluster: Morphing Primary Action -->
    <div class="sel-group management">
      <Transition name="morph" mode="out-in">
        <button
          v-if="!isScoreExpanded"
          :key="isActive ? 'none' : 'all'"
          class="morph-btn"
          :class="{ 'is-active-sel': isActive, 'is-idle-sel': !isActive }"
          @click="isActive ? $emit('clear') : $emit('select-all')"
        >
          <Icon v-if="isActive" name="deselect_all" size="16" />
          <span>{{ isActive ? "None" : "All" }}</span>
        </button>
      </Transition>
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

.morph-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 10px;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.4s var(--sys-motion-spring);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.morph-btn.is-idle-sel {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.25);
}

.morph-btn.is-active-sel {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: none;
}

.morph-btn:active {
  transform: scale(0.92);
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

.morph-enter-active,
.morph-leave-active {
  transition: all 0.4s var(--sys-motion-spring);
}

.morph-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}

.morph-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.9);
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
