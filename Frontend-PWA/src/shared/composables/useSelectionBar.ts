// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed, type Ref } from "vue";
import { useHaptics, DEFAULT_SCORE_THRESHOLD, SCORE_SELECTION_STEPS } from "@core";

/**
 * COMPOSABLE: useSelectionBar
 *
 * @remarks
 * Encapsulates the logic for the SelectionBar component, including score
 * threshold selection, comparison mode toggling, and expansion state management.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Business logic for the selection orchestrator.
 *
 * @param props - Component props including the current selection count.
 * @param emit - Component event emitter for 'select-score'.
 */
export function useSelectionBar(
  props: { count: number },
  emit: (e: "select-score", threshold: number, mode: "ge" | "le") => void
) {
  const haptics = useHaptics();

  // UI State
  const isScoreExpanded = ref(false);
  const filterMode = ref<"ge" | "le">("ge");
  const filterValue = ref(DEFAULT_SCORE_THRESHOLD);
  const valuePicker = ref<HTMLElement | null>(null);

  // Computed state
  const isActive = computed(() => props.count > 0);
  const thresholds = SCORE_SELECTION_STEPS;

  /**
   * Toggles the filter mode between 'Greater than or equal' and 'Less than or equal'.
   * Triggers an immediate selection update.
   */
  function toggleMode() {
    filterMode.value = filterMode.value === "ge" ? "le" : "ge";
    haptics.tap();
    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when mode is toggled
    // to ensure UI state remains synchronized with the active list filter.
    emit("select-score", filterValue.value, filterMode.value);
  }

  /**
   * Updates the active score threshold and triggers a selection update.
   * @param val - The new score threshold.
   */
  function selectValue(val: number) {
    if (filterValue.value === val) return;
    filterValue.value = val;
    haptics.medium();
    // [DECISION LOG] AUTO-APPLY: Immediately trigger selection when a threshold is clicked.
    // This reduces interaction friction compared to a two-step "select then apply" pattern.
    emit("select-score", filterValue.value, filterMode.value);
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
      // We use a timeout to wait for the DOM to render the expanded value-picker
      // before attempting to scroll to the end of the threshold list.
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
    // State
    isScoreExpanded,
    filterMode,
    filterValue,
    valuePicker,

    // Computed
    isActive,
    thresholds,

    // Actions
    toggleMode,
    selectValue,
    toggleExpand,
  };
}
