// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref, computed, type Ref } from "vue";
import { useHaptics } from "../../core/services/useHaptics";

/**
 * OPTIONS: PullToRefreshOptions
 *
 * @param isRefreshing - Reactive reference indicating if a sync is active.
 * @param onRefresh - Callback triggered when the pull threshold is met.
 */
interface PullToRefreshOptions {
  isRefreshing: Ref<boolean>;
  onRefresh: () => void;
}

/**
 * COMPOSABLE: usePullToRefresh
 *
 * @remarks
 * Encapsulates the Pull-to-Refresh (PTR) logic for scrollable views in Layer 2 (@shared).
 * Handles touch orchestration, resistance calculations, and haptic feedback
 * to provide a native-like refresh experience.
 *
 * It implements a "PTR Protection" layer to prevent accidental triggers
 * during horizontal scrolling and applies an "Android Optimized" sensitivity curve.
 *
 * @returns
 * - `isPulling`: Reactive flag indicating active user interaction.
 * - `pullOffset`: The current vertical displacement (unclamped).
 * - `ptrStyle`: Computed CSS variables for the UI indicator.
 * - `onTouchStart`: Touch start event handler.
 * - `onTouchMove`: Touch move event handler with resistance logic.
 * - `onTouchEnd`: Touch end handler for trigger evaluation.
 */
export function usePullToRefresh(options: PullToRefreshOptions) {
  const { isRefreshing, onRefresh } = options;
  const haptics = useHaptics();

  const touchStartY = ref(0);
  const touchStartX = ref(0);
  const pullOffset = ref(0);
  const threshold = 120;
  const isPulling = ref(false);

  /**
   * Computed CSS properties for the refresh indicator and content transform.
   */
  const ptrStyle = computed(() => ({
    "--ptr-offset": `${Math.min(pullOffset.value, threshold)}px`,
    "--ptr-opacity": Math.min(pullOffset.value / 60, 1),
    "--ptr-rotate": `${pullOffset.value * 2}deg`,
  }));

  let hapticFeedbackTriggered = false;

  /**
   * Initializes the pull sequence.
   * [GUARD] GUARD: Prevents PTR if already scrolled or refreshing.
   */
  function onTouchStart(e: TouchEvent) {
    if (window.scrollY > 0 || isRefreshing.value) return;
    touchStartY.value = e.touches[0].clientY;
    touchStartX.value = e.touches[0].clientX;
    isPulling.value = true;
    hapticFeedbackTriggered = false;
  }

  /**
   * Tracks displacement and applies resistance.
   */
  function onTouchMove(e: TouchEvent) {
    if (!isPulling.value) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;

    const rawDiff = Math.max(0, currentY - touchStartY.value);
    const xDiff = Math.abs(currentX - touchStartX.value);

    // [GUARD] PTR PROTECTION: Ignore if moving sideways more than down.
    if (xDiff > rawDiff * 0.5) {
      pullOffset.value = 0;
      isPulling.value = false;
      return;
    }

    // Apply resistance (clamped logarithmic-like curve).
    // [PERF] ANDROID OPTIMIZATION: More sensitive curve (0.85 -> 0.9) for better UX.
    pullOffset.value = Math.pow(rawDiff, 0.9) * 2;

    // Haptic feedback logic.
    if (pullOffset.value >= threshold && !hapticFeedbackTriggered) {
      haptics.heavy();
      hapticFeedbackTriggered = true;
    } else if (pullOffset.value < threshold && hapticFeedbackTriggered) {
      hapticFeedbackTriggered = false;
    }
  }

  /**
   * Evaluates the pull sequence on release.
   */
  function onTouchEnd() {
    if (!isPulling.value) return;

    if (pullOffset.value >= threshold) {
      onRefresh();
      haptics.success();
    }

    isPulling.value = false;
    pullOffset.value = 0;
  }

  return {
    isPulling,
    pullOffset,
    ptrStyle,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
