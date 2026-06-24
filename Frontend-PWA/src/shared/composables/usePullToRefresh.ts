// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref, computed, type Ref } from "vue";
import { useHaptics } from "./useHaptics";

/**
 * Options for the pull-to-refresh composable.
 */
interface PullToRefreshOptions {
  /** Reactive reference indicating if a synchronization process is currently active. */
  isRefreshing: Ref<boolean>;
  /** Callback function triggered when the pull threshold is met on release. */
  onRefresh: () => void;
}

/**
 * Shared composable for managing Pull-to-Refresh (PTR) logic.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Orchestrates touch events to provide a resilient and native-feeling refresh trigger.
 * - **Compliance:** Satisfies ADR Section II: Deep Import Protocol by residing in the shared layer.
 *
 * Handles touch orchestration, resistance calculations, and haptic feedback.
 * Implements a "PTR Protection" layer to prevent accidental triggers during horizontal scrolling.
 *
 * @param options - Configuration including the refreshing state and the refresh callback.
 * @returns An object containing reactive state and event handlers for the PTR lifecycle.
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
   */
  function onTouchStart(e: TouchEvent) {
    // [GUARD] PTR ACTIVATION: Prevents pull-to-refresh if the view is already scrolled
    // or if a refresh operation is currently in progress.
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

    // [GUARD] PTR PROTECTION: Ignore the pull if the user is moving sideways more than down.
    // This prevents accidental triggers during horizontal swipes or carousels.
    if (xDiff > rawDiff * 0.5) {
      pullOffset.value = 0;
      isPulling.value = false;
      return;
    }

    // Apply resistance (clamped logarithmic-like curve).
    // [DECISION LOG] ANDROID OPTIMIZATION: Using a sensitivity curve (0.9 exponent)
    // to provide a more responsive "rubber band" effect compared to linear scaling.
    pullOffset.value = Math.pow(rawDiff, 0.9) * 2;

    // Haptic feedback logic.
    // [DECISION LOG] HAPTIC STAGING: Trigger a 'heavy' tap exactly when the threshold
    // is crossed to provide tactile confirmation to the user.
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

    // [DECISION LOG] TRIGGER EVALUATION: Execute the refresh callback only if the
    // displacement exceeds the defined threshold (120px) at the moment of release.
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
