// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
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
 * @param props - Reactive component properties.
 * @param props.mode - Current comparison mode ('ge' for ≥, 'le' for ≤).
 * @param props.value - Current score threshold value.
 * @param emit - Vue emit function for state updates and selection events.
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
  props: { mode: "ge" | "le"; value: number },
  emit: {
    (e: "update:mode", thresholdMode: "ge" | "le"): void;
    (e: "update:value", thresholdValue: number): void;
    (e: "select", thresholdValue: number, thresholdMode: "ge" | "le"): void;
  }
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
    const newMode = props.mode === "ge" ? "le" : "ge";
    emit("update:mode", newMode);
    // [DECISION LOG] Haptic delegation: Manual haptics removed to favor
    // v-tactile directive in the view, preventing double-triggering.

    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when mode is toggled
    // to ensure UI state remains synchronized with the active list filter.
    emit("select", props.value, newMode);
  }

  /**
   * Updates the active score threshold and triggers a selection update.
   * @param thresholdValue - The new score threshold.
   */
  function selectValue(thresholdValue: number) {
    if (props.value === thresholdValue) return;
    emit("update:value", thresholdValue);
    // [DECISION LOG] Haptic delegation: Manual haptics removed to favor
    // v-tactile directive in the view, preventing double-triggering.

    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when a threshold is clicked.
    emit("select", thresholdValue, props.mode);
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
