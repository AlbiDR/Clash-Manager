<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  count: number;
  loading?: boolean;
}>();

defineEmits<{
  (e: "select-all"): void;
  (e: "clear"): void;
  (e: "done"): void;
  (e: "select-score", threshold: number, mode: "ge" | "le"): void;
}>();

const isScoreExpanded = ref(false);
</script>

<template>
  <div
    class="selection-bar animate-pop"
    :aria-busy="loading ? 'true' : 'false'"
  >
    <template v-if="loading">
      <div
        class="sk-text-line-m skeleton-anim"
        style="width: 100px; flex-shrink: 0"
      ></div>
      <div class="sk-button-s skeleton-anim" style="flex-shrink: 0"></div>
      <div class="sk-button-s skeleton-anim" style="flex-shrink: 0"></div>
      <div class="v-divider" style="flex-shrink: 0"></div>
      <!-- Skeleton matches collapsed state: Label + 1 Primary Button, pushed right -->
      <div class="score-group" style="margin-left: auto; flex-shrink: 0">
        <div
          class="sk-text-line-s skeleton-anim"
          style="width: 40px; margin-right: 4px"
        ></div>
        <div class="sk-button-s skeleton-anim" style="width: 40px"></div>
      </div>
      <div class="v-divider" style="flex-shrink: 0"></div>
      <div class="sk-button-s skeleton-anim" style="flex-shrink: 0"></div>
    </template>
    <template v-else>
      <div class="sel-count">{{ count }} Selected</div>

      <button class="action-chip" @click="$emit('select-all')">All</button>
      <button class="action-chip" @click="$emit('clear')">None</button>
      <div class="v-divider"></div>

      <!-- Pushed to the right -->
      <div
        class="score-group"
        :class="{ expanded: isScoreExpanded }"
        style="margin-left: auto"
      >
        <button class="sg-trigger" @click="isScoreExpanded = !isScoreExpanded">
          Score
          <span class="sg-arrow" :class="{ rotated: isScoreExpanded }">›</span>
        </button>

        <template v-if="isScoreExpanded">
          <button class="sg-btn" @click="$emit('select-score', 15, 'le')">
            ≤15
          </button>
          <button class="sg-btn" @click="$emit('select-score', 25, 'le')">
            ≤25
          </button>
          <button class="sg-btn" @click="$emit('select-score', 50, 'ge')">
            ≥50
          </button>
        </template>

        <!-- Primary Option always visible -->
        <button
          class="sg-btn highlight"
          @click="$emit('select-score', 75, 'ge')"
        >
          ≥75
        </button>
      </div>

      <div class="v-divider"></div>
      <button class="action-chip danger" @click="$emit('done')">Done</button>
    </template>
  </div>
</template>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--sys-color-outline-variant);
  gap: 8px;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}
.sel-count {
  font-size: 14px;
  font-weight: 850;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  margin-right: 4px;
  flex-shrink: 0;
}
.action-chip {
  background: none;
  border: none;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  white-space: nowrap;
  font-size: 13px;
  color: var(--sys-color-outline);
  transition: all 0.2s;
  flex-shrink: 0;
}
.action-chip:hover {
  background: var(--sys-color-surface-container-high);
  color: var(--sys-color-on-surface);
}
.action-chip.danger {
  color: var(--sys-color-error);
}
.action-chip.danger:hover {
  background: var(--sys-color-error-container);
}
.v-divider {
  width: 1px;
  height: 16px;
  background: var(--sys-color-outline-variant);
  margin: 0 2px;
  flex-shrink: 0;
}

.score-group {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--sys-color-surface-container-high);
  padding: 3px;
  padding-left: 8px;
  border-radius: 99px;
  border: 1px solid transparent;
  transition: all 0.3s ease;
  flex-shrink: 0;
}
.score-group.expanded {
  background: var(--sys-color-surface-container-highest);
  padding-right: 4px;
}

.sg-trigger {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  font-weight: 800;
  color: var(--sys-color-outline);
  text-transform: uppercase;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: 2px;
}
.sg-arrow {
  display: inline-block;
  font-size: 14px;
  line-height: 1;
  transition: transform 0.3s ease;
}
.sg-arrow.rotated {
  transform: rotate(180deg);
}

.sg-btn {
  background: var(--sys-color-surface);
  border: 1px solid rgba(0, 0, 0, 0.05);
  color: var(--sys-color-primary);
  font-weight: 700;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s var(--sys-motion-spring);
  white-space: nowrap;
}
.sg-btn:hover {
  transform: scale(1.05);
  background: var(--sys-color-primary-container);
  border-color: var(--sys-color-primary);
}
.sg-btn:active {
  transform: scale(0.95);
}
.sg-btn.highlight {
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  border-color: transparent;
}

.animate-pop {
  animation: popIn 0.3s var(--sys-motion-spring);
}
@keyframes popIn {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
