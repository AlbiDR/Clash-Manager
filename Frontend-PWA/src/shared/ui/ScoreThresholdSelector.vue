<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import Icon from "./Icon.vue";
import { vTactile } from "../directives/vTactile";
import { useScoreSelector } from "../composables/useScoreSelector";

/**
 * SHARED UI: ScoreThresholdSelector (Layer 2)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 (@shared/ui)
 * - **Role:** Interactive Molecule. Provides a high-precision threshold selector
 *   for score-based filtering in Roster and Headhunter views.
 *
 * **Satisfaction:**
 * - ADR Section II: Structural Unitary Architecture (Logic Delegation).
 * - ADR Section IV: Tactile Interaction (Hardware Brokering via useScoreSelector).
 *
 * [DECISION LOG] Delegated complex UI orchestration (scroll, expansion, haptics)
 * to the useScoreSelector composable to maintain a clinical, presentational view.
 *
 * [DECISION LOG] Modernized touch targets (48px footprint) and integrated v-tactile
 * for consistent physical response in the hybrid shell (Target B.2 / A.2).
 */

const props = defineProps<{
  /** Disables all interactions when true. */
  disabled?: boolean;
}>();

/** Comparison mode: 'ge' (Greater than or equal) or 'le' (Less than or equal). */
const mode = defineModel<"ge" | "le">("mode", { required: true });
/** Current active score threshold. */
const value = defineModel<number>("value", { required: true });

const emit = defineEmits<{
  /** Emitted when a selection is finalized (value or mode changed). */
  (e: "select", thresholdValue: number, thresholdMode: "ge" | "le"): void;
}>();

// [THREAT:] Unsynchronized filter state.
// [DECISION LOG] The useScoreSelector manages the interaction protocol. The 'select'
// event ensures that higher-layer filters are immediately notified of changes.
const {
  isScoreExpanded,
  valuePicker,
  thresholds,
  toggleMode,
  selectValue,
  toggleExpand,
} = useScoreSelector(mode, value, (thresholdValue, thresholdMode) => emit("select", thresholdValue, thresholdMode));
// `valuePicker` is bound purely through the template's `ref="valuePicker"` string
// match (Vue's compiler resolves it by name against this scope); vue-tsc's
// noUnusedLocals check cannot see that usage, so this keeps it a real error
// for genuinely dead bindings elsewhere while documenting this one as intentional.
void valuePicker;

defineExpose({
  /** Expansion state for external visibility (e.g., automated tests or parent logic). */
  isExpanded: isScoreExpanded,
});
</script>

<template>
  <div
    class="score-pill-group"
    :class="{ expanded: isScoreExpanded, disabled: props.disabled }"
  >
    <!-- Comparison Mode Toggle -->
    <button
      v-tactile
      class="mode-toggle"
      :disabled="props.disabled"
      :title="
        mode === 'ge' ? 'Greater than or equal' : 'Less than or equal'
      "
      @click="toggleMode"
    >
      <span class="mode-symbol">{{ mode === "ge" ? "≥" : "≤" }}</span>
    </button>

    <!-- Main Trigger / Label -->
    <button
      v-tactile
      class="sp-trigger"
      :disabled="props.disabled"
      @click="toggleExpand"
    >
      <span class="sp-label">{{ value }}</span>
      <span
        class="sp-chevron"
        :class="{ rotated: isScoreExpanded }"
      >
        <Icon
          name="chevron_down"
          size="14"
        />
      </span>
    </button>

    <!-- Dynamic Value Picker (Horizontal Scroll) -->
    <div
      v-if="isScoreExpanded"
      ref="valuePicker"
      class="value-picker"
    >
      <button
        v-for="threshold in thresholds"
        :key="threshold"
        v-tactile
        class="val-opt"
        :class="{ active: value === threshold }"
        @click="selectValue(threshold)"
      >
        {{ threshold }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.score-pill-group {
  display: flex;
  align-items: center;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  padding: 4px;
  gap: 4px;
  transition: all 0.4s var(--sys-motion-spring);
  border: 1px solid var(--sys-color-outline-variant);
  min-width: 92px;
  height: 48px; /* 48px Mobile Footprint (Target B.2) */
  position: relative;
  /* Default: Compact width, only what's needed */
  flex: 0 0 auto;
  justify-content: space-between;
  box-sizing: border-box;
}

.score-pill-group.expanded {
  background: var(--sys-color-surface-container-high);
  border-color: var(--sys-color-primary);
  /* Expanded: Grow only to content size, up to available space */
  flex: 0 1 auto;
  width: fit-content;
  max-width: 100%;
  /* Ensure it doesn't overflow parent flex */
  overflow: hidden;
}

.score-pill-group.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.mode-toggle {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--sys-color-primary-container);
  color: var(--sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.mode-toggle:active {
  transform: scale(0.85) rotate(-15deg);
}

.mode-symbol {
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}

.sp-trigger {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 40px;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  justify-content: center;
}

.sp-label {
  font-size: 15px;
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
  gap: 6px;
  padding: 0 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
  /* Fade mask for scroll indication */
  mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 10px,
    black calc(100% - 10px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 10px,
    black calc(100% - 10px),
    transparent 100%
  );
}

.value-picker::-webkit-scrollbar {
  display: none;
}

.val-opt {
  height: 36px;
  min-width: 44px;
  padding: 0 8px;
  border-radius: 8px;
  border: none;
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  font-size: 12px;
  font-weight: 850;
  font-family: var(--sys-font-family-mono);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.val-opt.active {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  transform: scale(1.05);
}
</style>
