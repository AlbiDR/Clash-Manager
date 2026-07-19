// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref, onMounted, onUnmounted } from "vue";

/**
 * COMPOSABLE: useHeaderScroll
 *
 * @remarks
 * Architectural role: Layer 2 (@shared) hardware broker for display APIs.
 * This composable standardizes scroll-depth awareness across the application,
 * primarily used to trigger visual transitions in sticky headers or navigation elements.
 * By using a passive listener, it ensures zero impact on scroll performance.
 *
 * @param threshold - The scroll-depth (in pixels) required to trigger the 'scrolled' state. Defaults to 20.
 *
 * @returns
 * - Reactive State: `isScrolled` (Ref<boolean>) indicating if window.scrollY > threshold.
 *
 * @sideeffects
 * - Registers a passive 'scroll' event listener on the global `window` object.
 * - Manages lifecycle by automatically removing listeners during the `onUnmounted` hook.
 */
export function useHeaderScroll(threshold = 20) {
  const isScrolled = ref(false);

  // [THREAT:] Layout thrashing and rendering thread blocking during rapid scrolling.
  // [DECISION LOG] Use a highly efficient, single-line comparative logic to toggle the reactive
  // boolean. This minimizes style recalcs and ensures zero impact on scroll performance.
  const handleScroll = () => {
    isScrolled.value = window.scrollY > threshold;
  };

  onMounted(() => {
    // [THREAT:] Excessive main-thread overhead causing scroll stutter on low-end Android WebViews.
    // [DECISION LOG] Register scroll listener with passive: true option, letting the browser
    // perform optimal compositor-driven scrolling without blocking on JS execution.
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check in case page is already scrolled
    handleScroll();
  });

  onUnmounted(() => {
    // [THREAT:] Memory leak by leaving detached scroll listeners active in the global context.
    // [DECISION LOG] Explicitly prune the window event scroll listener during lifecycle destruction.
    window.removeEventListener("scroll", handleScroll);
  });

  return {
    isScrolled,
  };
}
