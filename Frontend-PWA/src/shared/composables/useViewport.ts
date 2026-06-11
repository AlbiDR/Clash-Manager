// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, onMounted, onUnmounted } from "vue";

/**
 * COMPOSABLE: useViewport
 *
 * @remarks
 * Orchestrates viewport-aware reactivity across the monorepo.
 * Centralizes breakpoints and window event listeners to prevent
 * redundant `window.innerWidth` checks and listener duplication.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Environment sensing driver.
 *
 * @returns
 * - `isDesktop`: Reactive boolean indicating if the viewport exceeds 1024px.
 * - `isMobileNarrow`: Reactive boolean indicating if the viewport is below 360px.
 */
export function useViewport() {
  const isDesktop = ref(false);
  const isMobileNarrow = ref(false);

  const checkViewport = () => {
    if (typeof window === "undefined") return;

    // [DECISION LOG] BREAKPOINTS:
    // 1024px: Standard desktop/tablet-landscape threshold for layout shifts.
    // 360px: Minimum standard mobile width, used for aggressive text truncation.
    isDesktop.value = window.innerWidth > 1024;
    isMobileNarrow.value = window.innerWidth < 360;
  };

  onMounted(() => {
    checkViewport();
    window.addEventListener("resize", checkViewport);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", checkViewport);
  });

  return {
    isDesktop,
    isMobileNarrow,
  };
}
