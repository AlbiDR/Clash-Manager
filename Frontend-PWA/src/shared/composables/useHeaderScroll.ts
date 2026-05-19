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

  const handleScroll = () => {
    isScrolled.value = window.scrollY > threshold;
  };

  onMounted(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check in case page is already scrolled
    handleScroll();
  });

  onUnmounted(() => {
    window.removeEventListener("scroll", handleScroll);
  });

  return {
    isScrolled,
  };
}
