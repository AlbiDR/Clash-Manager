// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";
import { DEFAULT_SCORE_THRESHOLD } from "@core";

/**
 * COMPOSABLE: useSelectionBar
 *
 * @remarks
 * Encapsulates the shared state for the SelectionBar component, including
 * the current filter threshold and mode.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** State orchestrator for the selection bar.
 *
 * @param props - Component props including the current selection count.
 */
export function useSelectionBar(props: { count: number }) {
  // Shared Filter State
  const filterMode = ref<"ge" | "le">("ge");
  const filterValue = ref(DEFAULT_SCORE_THRESHOLD);

  // Computed state
  const isActive = computed(() => props.count > 0);

  return {
    filterMode,
    filterValue,
    isActive,
  };
}
