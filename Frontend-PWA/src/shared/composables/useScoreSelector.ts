// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, type Ref } from "vue";
import { SCORE_SELECTION_STEPS } from "@core";
import { useHaptics } from "./useHaptics";

/**
 * COMPOSABLE: useScoreSelector
 *
 * @remarks
 * Encapsulates the UI logic for the score threshold picker, including
 * expansion state, haptic feedback on interaction, and smooth scrolling.
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
 * - Triggers hardware haptic feedback via `useHaptics`.
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
  const haptics = useHaptics();

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
    haptics.tap();
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
    haptics.medium();
    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when a threshold is clicked.
    emit("select", thresholdValue, props.mode);
  }

  /**
   * Toggles the expansion state of the score threshold picker.
   * Handles smooth scrolling to the end of the list when expanded.
   */
  function toggleExpand() {
    isScoreExpanded.value = !isScoreExpanded.value;
    haptics.tap();
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
