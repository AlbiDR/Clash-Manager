// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import type { Ref, ComputedRef } from "vue";

/**
 * COMPOSABLE: useConsoleSelection
 *
 * @remarks
 * Orchestrates batch selection logic for console views, including
 * bulk selection and score-based thresholding.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Role:** Selection logic handler.
 * - **Satisfaction:** Satisfies ADR Section I: Foundations (SRP) and ADR Section III:
 *   Data Flow (Orchestration). Decouples batch selection workflows from
 *   monolithic controllers to ensure technical purity and reusability.
 *
 * @param filteredItems - The reactive dataset that has been filtered and sorted.
 * @param batchIdMapper - Logic for extracting a unique ID from a candidate item.
 * @param setForceSelectionMode - Action to manually override the selection mode.
 * @param selectAll - Action to replace the current selection with a new set of IDs.
 * @param scoreGetter - Optional logic to extract a numeric performance score.
 * @returns Standardized handlers for batch selection.
 */
export function useConsoleSelection<T>(
  filteredItems: Ref<readonly T[]> | ComputedRef<readonly T[]>,
  batchIdMapper: (candidateItem: T) => string,
  setForceSelectionMode: (forced: boolean) => void,
  selectAll: (ids: string[]) => void,
  scoreGetter?: (candidateItem: T) => number
) {
  /** Action: Select all currently filtered items. */
  function handleSelectAll() {
    // [DECISION LOG] FLATTENING: Extracts IDs from the currently filtered dataset
    // to ensure selection respect active search/filter constraints.
    const targetIds = filteredItems.value.map(batchIdMapper);

    // [THREAT:] Accidental 'empty' selection mode persistence.
    // Rationale: Selecting all items should always disable forced mode as
    // the selection set is now authoritative and potentially non-empty.
    setForceSelectionMode(false);
    selectAll(targetIds);
  }

  /**
   * Action: Select items based on a numeric score threshold.
   *
   * @param threshold - The numeric value to compare against.
   * @param mode - Comparison mode ('ge' for greater-than-equal, 'le' for less-than-equal).
   * @param customScoreGetter - Optional override for extracting the score.
   */
  function handleSelectScore(
    threshold: number,
    mode: "ge" | "le",
    customScoreGetter?: (candidateItem: T) => number
  ) {
    const scoreExtractor = customScoreGetter || scoreGetter;
    if (!scoreExtractor) return;

    // [DECISION LOG] PREDICATE FILTERING: We filter the active dataset using
    // the score threshold to allow users to target specific performance bands
    // (e.g. "Select all members with score >= 90") in one tap.
    const targetIds = filteredItems.value
      .filter((candidateItem: T) => {
        const score = scoreExtractor(candidateItem);
        return mode === "ge" ? score >= threshold : score <= threshold;
      })
      .map(batchIdMapper);

    // [THREAT:] Ghost selection UI.
    // Rationale: If the threshold produces zero matches, we force selection
    // mode ON to allow the user to manually adjust or see the 'zero' state
    // feedback in the FAB, rather than the FAB disappearing abruptly.
    setForceSelectionMode(targetIds.length === 0);
    selectAll(targetIds);
  }

  return {
    handleSelectAll,
    handleSelectScore,
  };
}
