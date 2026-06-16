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
  batchIdMapper: (item: T) => string,
  setForceSelectionMode: (forced: boolean) => void,
  selectAll: (ids: string[]) => void,
  scoreGetter?: (item: T) => number
) {
  /** Action: Select all currently filtered items. */
  function handleSelectAll() {
    const targetIds = filteredItems.value.map(batchIdMapper);
    setForceSelectionMode(false);
    selectAll(targetIds);
  }

  /** Action: Select items based on a numeric score threshold. */
  function handleSelectScore(
    threshold: number,
    mode: "ge" | "le",
    customScoreGetter?: (candidateItem: T) => number
  ) {
    const scoreExtractor = customScoreGetter || scoreGetter;
    if (!scoreExtractor) return;

    const targetIds = filteredItems.value
      .filter((candidateItem: T) => {
        const score = scoreExtractor(candidateItem);
        return mode === "ge" ? score >= threshold : score <= threshold;
      })
      .map(batchIdMapper);

    setForceSelectionMode(targetIds.length === 0);
    selectAll(targetIds);
  }

  return {
    handleSelectAll,
    handleSelectScore,
  };
}
