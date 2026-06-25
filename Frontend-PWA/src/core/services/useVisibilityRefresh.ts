// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { onMounted, onUnmounted, type Ref, type ComputedRef, toValue } from "vue";
import { registerVisibilityRefresh } from "../utils/visibility";

/**
 * COMPOSABLE: useVisibilityRefresh
 *
 * @remarks
 * A Vue-lifecycle aware wrapper for the visibility refresh utility.
 * Automatically manages listener attachment and cleanup within a component
 * or composable scope.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Role:** Orchestrates visibility-triggered revalidation.
 * - **Satisfaction:** Satisfies ADR Section II: Presentation Orchestration.
 *   Decouples the low-level visibility event listener from component logic,
 *   ensuring data remains fresh when the application returns from the background.
 *
 * @param refreshFn - The action to trigger when the document becomes visible.
 * @param isRefreshing - Optional reactive guard to prevent concurrent refreshes.
 */
export function useVisibilityRefresh(
  refreshFn: () => void | Promise<void>,
  isRefreshing?: Ref<boolean> | ComputedRef<boolean>
) {
  let cleanup: (() => void) | null = null;

  onMounted(() => {
    cleanup = registerVisibilityRefresh(() => {
      // [GUARD] Avoid triggering if a refresh is already in progress.
      if (isRefreshing && toValue(isRefreshing)) return;
      refreshFn();
    });
  });

  onUnmounted(() => {
    if (cleanup) cleanup();
  });
}
