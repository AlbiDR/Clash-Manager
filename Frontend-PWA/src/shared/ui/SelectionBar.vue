<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [SHARED] SELECTION ORCHESTRATOR
 * ----------------------------------------------------------------------------
 * A contextual bar for managing bulk selection, score filtering, and
 * primary actions. Morphs between selection and management states.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Component (@shared)
 * - **Role:** Horizontal orchestrator for list item management.
 * - **Side Effects:** Triggers haptic feedback on user interaction.
 *
 * **State Management:**
 * - Logic encapsulated in `useSelectionBar` composable.
 * - Score filtering delegated to `ScoreThresholdSelector` component.
 * - Emits selection events to parent feature containers.
 *
 * @remarks
 * Satisfies ADR Section II: Structural Unitary Architecture.
 * Satisfies ADR Section VII: Naming Conventions (Domain-descriptive emitters).
 * ============================================================================
 */

import ScoreThresholdSelector from "./ScoreThresholdSelector.vue";
import { useSelectionBar } from "../composables/useSelectionBar";
import { useHaptics } from "@core";

const props = defineProps<{
  count: number;
  totalCount: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "select-all"): void;
  (e: "clear"): void;
  (e: "done"): void;
  (e: "select-score", threshold: number, mode: "ge" | "le"): void;
}>();

const {
  filterMode,
  filterValue,
  isActive,
} = useSelectionBar(props);

const haptics = useHaptics();

/**
 * Triggers haptic feedback on interaction start.
 */
function onInteractionStart() {
  haptics.tap();
}

</script>

<template>
  <div
    class="selection-bar animate-pop"
    :class="{ 'is-active': isActive, 'is-loading': props.loading }"
    :aria-busy="props.loading ? 'true' : 'false'"
  >
    <!-- Left Cluster: Strategy & Selection Tools -->
    <div class="sel-group strategy">
      <!-- Score Dynamic Selector -->
      <ScoreThresholdSelector
        v-model:mode="filterMode"
        v-model:value="filterValue"
        :disabled="props.loading"
        @select="(v, m) => emit('select-score', v, m)"
      />
    </div>

    <!-- Right Cluster: Morphing Primary Action -->
    <div class="sel-group management">
      <!-- Count Bubble (Active Only) -->
      <Transition name="status-pop">
        <div v-if="isActive" class="count-pill">
          {{ props.count }}/{{ props.totalCount }}
        </div>
      </Transition>

      <!-- Persistent Button Frame -->
      <button
        class="morph-btn"
        :class="{
          'is-active-sel': isActive,
          'is-idle-sel': !isActive,
        }"
        @click="
          isActive
            ? emit('clear')
            : emit('select-score', filterValue, filterMode)
        "
        @pointerdown="onInteractionStart"
      >
        <Transition name="text-morph" mode="out-in">
          <span v-if="!isActive" key="select">Select</span>
          <span v-else key="done">Done</span>
        </Transition>
      </button>
    </div>

    <!-- Skeleton Overlays -->
    <div v-if="props.loading" class="loading-overlay">
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

.sel-group.management {
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 6px;
}

.morph-btn {
  height: 32px;
  /* Fixed width to prevent twitchy resizing between "Select" and "Done" */
  width: 84px;
  padding: 0;
  justify-content: center;
  border-radius: 10px;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  /* Smoother, slightly slower transition */
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
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

/* Count Pill */
.count-pill {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--sys-font-family-mono);
  border: 1px solid var(--sys-color-outline-variant);
}

/* Transitions */
.status-pop-enter-active {
  animation: pop-in 0.4s var(--sys-motion-spring);
}
.status-pop-leave-active {
  animation: pop-in 0.3s var(--sys-motion-spring) reverse;
}

.text-morph-enter-active,
.text-morph-leave-active {
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.text-morph-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.text-morph-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
