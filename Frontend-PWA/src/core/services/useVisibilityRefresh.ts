// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { onMounted, onUnmounted, type Ref, type ComputedRef, toValue } from "vue";
import { registerVisibilityRefresh } from "../utils/visibility";

/**
 * [CORE SERVICE] USE VISIBILITY REFRESH
 * ----------------------------------------------------------------------------
 * Rationale: Vue-lifecycle aware wrapper for the visibility refresh utility.
 * Automatically manages listener attachment and cleanup within a component
 * or composable scope.
 * ----------------------------------------------------------------------------
 *
 * @param refreshFn - Action to trigger on visibility change.
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
