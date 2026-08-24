// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";
import { SCORE_SELECTION_STEPS } from "@core";

/**
 * COMPOSABLE: useScoreSelector
 *
 * @remarks
 * Encapsulates the UI logic for the score threshold picker, including
 * expansion state, and smooth scrolling.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Internal logic for the ScoreThresholdSelector component.
 * - **Satisfaction:** ADR Section II: Structural Unitary Architecture.
 *
 * @param mode - The `defineModel` ref for the comparison mode ('ge' for ≥, 'le' for ≤).
 * @param value - The `defineModel` ref for the current score threshold value.
 * @param emitSelect - Callback invoked to finalize a selection (mode or value changed).
 *
 * @returns
 * - `isScoreExpanded`: Reactive boolean for picker expansion state.
 * - `valuePicker`: Ref to the scrollable HTML container.
 * - `thresholds`: Static array of available score steps.
 * - `toggleMode`: Function to switch comparison direction.
 * - `selectValue`: Function to commit a specific score value.
 * - `toggleExpand`: Function to open/close the picker with scroll logic.
 *
 * @sideeffects
 * - Manipulates DOM scroll position via `scrollTo` when expanded.
 */
export function useScoreSelector(
  mode: Ref<"ge" | "le">,
  value: Ref<number>,
  emitSelect: (thresholdValue: number, thresholdMode: "ge" | "le") => void,
) {
  // UI State
  const isScoreExpanded = ref(false);
  const valuePicker = ref<HTMLElement | null>(null);

  // Constants
  const thresholds = SCORE_SELECTION_STEPS;

  /**
   * Toggles the filter mode between 'Greater than or equal' and 'Less than or equal'.
   * Triggers an immediate selection update.
   */
  function toggleMode() {
    const newMode = mode.value === "ge" ? "le" : "ge";
    mode.value = newMode;
    // [DECISION LOG] Haptic delegation: Manual haptics removed to favor
    // v-tactile directive in the view, preventing double-triggering.

    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when mode is toggled
    // to ensure UI state remains synchronized with the active list filter.
    emitSelect(value.value, newMode);
  }

  /**
   * Updates the active score threshold and triggers a selection update.
   * @param thresholdValue - The new score threshold.
   */
  function selectValue(thresholdValue: number) {
    if (value.value === thresholdValue) return;
    value.value = thresholdValue;
    // [DECISION LOG] Haptic delegation: Manual haptics removed to favor
    // v-tactile directive in the view, preventing double-triggering.

    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when a threshold is clicked.
    emitSelect(thresholdValue, mode.value);
  }

  /**
   * Toggles the expansion state of the score threshold picker.
   * Handles smooth scrolling to the end of the list when expanded.
   */
  function toggleExpand() {
    isScoreExpanded.value = !isScoreExpanded.value;
    // [DECISION LOG] Haptic delegation: Manual haptics removed to favor
    // v-tactile directive in the view, preventing double-triggering.

    if (isScoreExpanded.value) {
      // [DECISION LOG] DEFERRED SCROLL
      setTimeout(() => {
        if (valuePicker.value && typeof valuePicker.value.scrollTo === "function") {
          valuePicker.value.scrollTo({
            left: valuePicker.value.scrollWidth,
            behavior: "smooth",
          });
        }
      }, 50);
    }
  }

  return {
    isScoreExpanded,
    valuePicker,
    thresholds,
    toggleMode,
    selectValue,
    toggleExpand,
  };
}
