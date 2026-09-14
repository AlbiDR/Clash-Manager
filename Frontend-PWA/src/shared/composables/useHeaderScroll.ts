// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, type Ref } from "vue";

/**
 * COMPOSABLE: useHeaderScroll
 *
 * @remarks
 * Architectural role: Layer 2 (@shared) hardware broker for display APIs.
 * Standardises scroll awareness for sticky headers: how deep the page has
 * travelled, and whether the reader is currently moving away from the top.
 * A passive listener keeps it off the scroll critical path.
 *
 * [DECISION LOG] DIRECTION NEEDS HYSTERESIS OR IT IS A STROBE.
 * Condensing on raw direction means a header that flips on every jitter of a
 * trackpad or the rubber-band at the end of a fling. The reader has to travel
 * `hysteresis` pixels consistently in one direction before the header agrees
 * that they meant it, and the anchor resets whenever the direction changes, so
 * the distance is always measured from the turn rather than from the top.
 *
 * [DECISION LOG] A HEADER NEVER CONDENSES OVER A CONTROL IN USE.
 * `isPinned` lets the host veto: an open search field, an active selection. The
 * rule is the same one the search control follows - do not take away something
 * that is doing work, and never hide the reason a list looks the way it does.
 * The top of the page is also always expanded, so scrolling home is a reliable
 * way back to the full header.
 *
 * [THREAT:] Under `<KeepAlive>` a view that is navigated away from is NOT
 * unmounted, so `onUnmounted` never runs and a listener per console would stay
 * subscribed for the life of the session, all of them recomputing on every
 * scroll of whichever console is actually on screen. The listener is bound on
 * activate and released on deactivate.
 *
 * @param options - Depth before "scrolled", travel before condensing, and the
 *   host's veto. A bare number is accepted for the original threshold-only
 *   call signature.
 *
 * @returns
 * - `isScrolled`: the page has travelled past `threshold`.
 * - `isCondensed`: the reader is moving away from the top and nothing is pinned.
 */
export interface HeaderScrollOptions {
  /** Depth, in pixels, before the header treats the page as scrolled. */
  threshold?: number;
  /** Travel in one direction, in pixels, before condensing flips. */
  hysteresis?: number;
  /** Returns true while the header must stay expanded. */
  isPinned?: () => boolean;
}

/** Default travel before the header believes a direction change was intended. */
const DEFAULT_HYSTERESIS_PX = 48;

export function useHeaderScroll(
  options: HeaderScrollOptions | number = {},
): { isScrolled: Ref<boolean>; isCondensed: Ref<boolean> } {
  const { threshold = 20, hysteresis = DEFAULT_HYSTERESIS_PX, isPinned } =
    typeof options === "number" ? { threshold: options } as HeaderScrollOptions : options;

  const isScrolled = ref(false);
  const isCondensed = ref(false);

  /** Where the current run of travel in one direction began. */
  let anchorY = 0;
  /** The previous sample, used only to tell which way the page moved. */
  let lastY = 0;
  let lastDirection: "up" | "down" | null = null;

  const handleScroll = (): void => {
    const currentY = window.scrollY;
    isScrolled.value = currentY > threshold;

    // The top of the page, and any pinned state, always show the whole header.
    if (currentY <= threshold || isPinned?.()) {
      isCondensed.value = false;
      anchorY = currentY;
      lastY = currentY;
      lastDirection = null;
      return;
    }

    const direction = currentY > lastY ? "down" : currentY < lastY ? "up" : lastDirection;
    if (direction !== lastDirection) {
      anchorY = currentY;
      lastDirection = direction;
    }

    if (direction === "down" && currentY - anchorY > hysteresis) {
      isCondensed.value = true;
    } else if (direction === "up" && anchorY - currentY > hysteresis) {
      isCondensed.value = false;
    }

    lastY = currentY;
  };

  const subscribe = (): void => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    // The page may already be scrolled when this view is shown.
    handleScroll();
  };

  const unsubscribe = (): void => {
    window.removeEventListener("scroll", handleScroll);
  };

  // Both pairs are registered on purpose. A component inside <KeepAlive> fires
  // onMounted AND onActivated on its first render, but addEventListener ignores
  // a repeat of the same (type, callback, capture) triple, so the second call is
  // a no-op rather than a duplicate listener. Keeping the mount pair means this
  // still works for a host that is never kept alive, which is how it is mounted
  // in tests.
  onMounted(subscribe);
  onUnmounted(unsubscribe);
  onActivated(subscribe);
  onDeactivated(unsubscribe);

  return {
    isScrolled,
    isCondensed,
  };
}
