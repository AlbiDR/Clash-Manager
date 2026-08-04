// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, onMounted, onUnmounted } from "vue";

/**
 * COMPOSABLE: usePointerCapability
 *
 * @remarks
 * Detects whether the primary input mechanism is a coarse pointer (touch) or
 * a fine pointer (mouse/trackpad), via the `(pointer: coarse)` media query.
 *
 * Distinct from `useViewport`'s width-based breakpoints: a wide touchscreen
 * tablet is still a coarse pointer, and a narrow resized desktop window is
 * still a fine pointer. Interaction patterns (hover vs. tap) should key off
 * this, not viewport width.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 *
 * @returns
 * - `isCoarsePointer`: Reactive boolean, true when the primary pointer is touch-like.
 */
export function usePointerCapability() {
  const isCoarsePointer = ref(false);
  let mediaQuery: MediaQueryList | null = null;

  const update = () => {
    isCoarsePointer.value = !!mediaQuery?.matches;
  };

  onMounted(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    mediaQuery = window.matchMedia("(pointer: coarse)");
    update();
    mediaQuery.addEventListener("change", update);
  });

  onUnmounted(() => {
    mediaQuery?.removeEventListener("change", update);
  });

  return { isCoarsePointer };
}
