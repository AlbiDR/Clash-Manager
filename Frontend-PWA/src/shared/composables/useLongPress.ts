// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref } from "vue";
import { useHaptics } from "./useHaptics";

/**
 * COMPOSABLE: useLongPress
 *
 * @remarks
 * Orchestrates a standardized long-press gesture across the application,
 * integrating hardware-brokered haptic feedback with timer-based execution.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Presentation logic driver for gesture-based selection.
 * - **Satisfaction:** ADR Section II (Structural Unitary Architecture) and Section IV (Resilience & Operational Security).
 *
 * @param callback - Function to execute upon successful long-press duration.
 * @param duration - Hold duration in milliseconds before activation. Defaults to 400ms.
 *
 * @returns
 * - `isLongPressActive`: Reactive boolean indicating if a long-press is currently completed.
 * - `start`: Entry point to initiate the gesture timer.
 * - `cancel`: Safety guard to abort the gesture timer before expiry.
 *
 * @sideeffects
 * - Accesses the `useHaptics` service to trigger device vibration.
 * - Manages an internal `setTimeout` lifecycle.
 */
export function useLongPress(callback: () => void, duration = 400) {
  const haptics = useHaptics();
  const isLongPressActive = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initiates the long-press sequence.
   *
   * @remarks
   * // [THREAT:] Uncontrolled gesture timers can overlap or fire after component unmount.
   * // [DECISION LOG] Haptic acknowledgment is triggered exactly at the threshold
   * // to provide clear tactile feedback that the selection action has been locked.
   */
  function start() {
    isLongPressActive.value = false;
    timer = setTimeout(() => {
      isLongPressActive.value = true;
      
      // Standardized Selection Haptic (Medium pulse)
      haptics.longPress();
      callback();
    }, duration);
  }

  /**
   * Aborts the active long-press sequence.
   *
   * @remarks
   * Called on `touchend` or `mouseup` to prevent the callback from firing
   * if the user releases the hold before the `duration` threshold.
   */
  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    isLongPressActive.value = false;
  }

  return {
    isLongPressActive,
    start,
    cancel,
  };
}
