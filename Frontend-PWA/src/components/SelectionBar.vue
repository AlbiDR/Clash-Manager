<script setup lang="ts">
import { ref, computed } from "vue";
import Icon from "./Icon.vue";

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

const isScoreExpanded = ref(false);
const isActive = computed(() => props.count > 0);
</script>

<template>
  <div
    class="selection-bar animate-pop"
    :class="{ 'is-active': isActive, 'is-loading': loading }"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <!-- Left: Status Cluster -->
    <div class="sel-status">
      <div class="indicator-ring">
        <div class="indicator-dot" :class="{ active: isActive }"></div>
      </div>
      <span class="status-label">
        {{ isActive ? `${count} Selected` : "Multi-Select" }}
      </span>
    </div>

    <!-- Center: Primary Actions -->
    <div class="sel-actions">
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

      <!-- Score Quick Selector -->
      <div class="score-pill-group" :class="{ expanded: isScoreExpanded }">
        <button class="sp-trigger" @click="isScoreExpanded = !isScoreExpanded">
          <Icon name="star" size="14" />
          <span class="sp-label">Score</span>
          <span class="sp-chevron" :class="{ rotated: isScoreExpanded }">
            <Icon name="chevron_down" size="14" />
          </span>
        </button>

        <TransitionGroup name="sp-fade">
          <template v-if="isScoreExpanded">
            <button
              key="le15"
              class="sp-opt"
              @click="$emit('select-score', 15, 'le')"
            >
              ≤15
            </button>
            <button
              key="le25"
              class="sp-opt"
              @click="$emit('select-score', 25, 'le')"
            >
              ≤25
            </button>
            <button
              key="ge50"
              class="sp-opt"
              @click="$emit('select-score', 50, 'ge')"
            >
              ≥50
            </button>
          </template>
        </TransitionGroup>

        <button class="sp-opt primary" @click="$emit('select-score', 75, 'ge')">
          ≥75
        </button>
      </div>
    </div>

    <!-- Right: Done Button (Slides in) -->
    <Transition name="slide-done">
      <button v-if="isActive" class="done-action" @click="$emit('done')">
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
  height: 44px;
  padding: 0 4px;
  background: var(
    --sys-color-surface-container-low,
    var(--sys-color-surface-container)
  );
  border-radius: 12px;
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
  /* 🏗️ MOBILE: Allows scrolling if too many options */
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.sel-actions::-webkit-scrollbar {
  display: none;
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
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.action-pill:hover:not(:disabled) {
  background: var(--sys-color-surface-container-highest);
  filter: brightness(1.05);
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

/* Score Pill Group */
.score-pill-group {
  display: flex;
  align-items: center;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
  transition: all 0.3s var(--sys-motion-spring);
  flex-shrink: 0;
}

.score-pill-group.expanded {
  background: var(--sys-color-primary-container);
  padding-right: 6px;
}

.sp-trigger {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 26px;
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
}

.expanded .sp-trigger {
  color: var(--sys-color-on-primary-container);
}

.sp-label {
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sp-chevron {
  transition: transform 0.3s var(--sys-motion-spring);
  display: flex;
}

.sp-chevron.rotated {
  transform: rotate(180deg);
}

.sp-opt {
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  border: none;
  background: rgba(var(--sys-color-on-primary-container-rgb), 0.08);
  color: var(--sys-color-on-primary-container);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.sp-opt:active {
  transform: scale(0.9);
}

.sp-opt.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

/* Done Action */
.done-action {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  border: none;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 34px;
  font-weight: 900;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.2);
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
.sk-line {
  height: 12px;
  width: 100%;
  background: var(--sys-color-surface-container-highest);
  border-radius: 6px;
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

.sp-fade-enter-active,
.sp-fade-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.sp-fade-enter-from,
.sp-fade-leave-to {
  opacity: 0;
  width: 0;
  margin: 0;
  padding: 0;
  transform: scale(0.8);
}

@keyframes popIn {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.animate-pop {
  animation: popIn 0.4s var(--sys-motion-spring);
}
</style>
