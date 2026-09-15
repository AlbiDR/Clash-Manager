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
import { vTactile } from "../directives/vTactile";

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
        @select="(thresholdValue, thresholdMode) => emit('select-score', thresholdValue, thresholdMode)"
      />
    </div>

    <!-- Fixed-width action: the count lives inside the button, so entering
         selection mode cannot move either the button or its parent group. -->
    <div
      class="sel-group management"
      :class="{ 'has-view-options': $slots['view-options'] }"
    >
      <button
        v-tactile
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
      >
        <Transition
          name="text-morph"
          mode="out-in"
        >
          <span
            v-if="!isActive"
            key="select"
          >Select</span>
          <span
            v-else
            key="done"
          >Done · {{ props.count }}</span>
        </Transition>
      </button>
      <div
        v-if="$slots['view-options']"
        class="view-options-segment"
      >
        <slot name="view-options" />
      </div>
    </div>

    <!-- Skeleton Overlays -->
    <div
      v-if="props.loading"
      class="loading-overlay"
    >
      <div class="sk-line skeleton-anim" />
    </div>
  </div>
</template>

<style scoped>
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: auto;
  height: 48px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  gap: var(--sys-space-8);
  transition: all var(--sys-motion-duration-400) var(--sys-motion-spring);
  position: relative;
  overflow: visible;
  box-sizing: border-box;
}

.selection-bar.is-active {
  box-shadow: none;
}

.sel-group {
  display: flex;
  align-items: center;
  height: 100%;
}

.sel-group.strategy {
  flex: 0 0 auto;
  gap: var(--sys-space-6);
  min-width: 0;
}

.sel-group.management {
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 0;
}

.view-options-segment {
  display: flex;
  align-self: stretch;
}

/* The view trigger and Select/Done are one action cluster: their adjacent
   edges meet, their heights match, and selection-state colors move together.
   The trigger deliberately trails the primary action so Select/Done remains
   the leading, easiest-to-scan decision. */
.management.has-view-options .morph-btn {
  order: 1;
  border-radius: var(--sys-shape-corner-medium) 0 0 var(--sys-shape-corner-medium);
}

.management.has-view-options .view-options-segment { order: 2; }

.selection-bar:not(.is-active) .view-options-segment :deep(.view-options-trigger) {
  color: var(--sys-color-on-primary);
  background: var(--sys-color-primary);
  border-left: 1px solid var(--sys-overlay-light-medium);
  box-shadow: 0 4px 12px rgba(var(--sys-color-primary-rgb), 0.25);
}

.selection-bar.is-active .view-options-segment :deep(.view-options-trigger) {
  color: var(--sys-color-on-surface-variant);
  background: var(--sys-color-surface-container-highest);
  border: 1px solid var(--sys-color-outline-variant);
  border-left: 0;
  box-shadow: none;
}

.selection-bar:not(.is-active) .view-options-segment :deep(.view-options-trigger.is-open),
.selection-bar:not(.is-active) .view-options-segment :deep(.view-options-trigger:hover) {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
}

.morph-btn {
  height: 48px;
  /* The wider active label is reserved while idle, so this action never moves
     when a row is selected or cleared. */
  width: 112px;
  padding: 0;
  justify-content: center;
  border-radius: var(--sys-shape-corner-medium);
  border: none;
  display: flex;
  align-items: center;
  gap: var(--sys-space-8);
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  /* Smoother, slightly slower transition */
  transition: all var(--sys-motion-duration-500) cubic-bezier(0.34, 1.56, 0.64, 1);
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

.text-morph-enter-active,
.text-morph-leave-active {
  transition: all var(--sys-motion-duration-200) cubic-bezier(0.34, 1.56, 0.64, 1);
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
