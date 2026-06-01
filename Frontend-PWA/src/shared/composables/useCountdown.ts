// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, onMounted, onUnmounted, watch, type Ref, type ComputedRef } from "vue";
import { formatCountdown } from "@core/utils/formatters";

interface CountdownOptions {
  /** Whether to show days in the formatted output (e.g., "1d 05h"). */
  showDays?: boolean;
  /** Callback triggered when the countdown reaches "Ended". */
  onExpiry?: () => void;
}

/**
 * Shared composable for managing a live countdown timer.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Orchestrates a periodic timer to update a human-readable countdown.
 *
 * @param targetDate - Reactive reference to the target Date object.
 * @param options - Optional configuration (showDays, onExpiry callback).
 * @returns A reactive Ref containing the formatted countdown string.
 */
export function useCountdown(
  targetDate: Ref<Date | null> | ComputedRef<Date | null>,
  options: CountdownOptions = {}
) {
  const formattedValue = ref("");
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * Updates the formattedValue based on the current time and targetDate.
   * Logic derived from ADR Section III (Validation Boundaries) for consistent time display.
   */
  function update() {
    if (!targetDate.value) {
      formattedValue.value = "";
      return;
    }

    const wasEnded = formattedValue.value === "Ended";
    formattedValue.value = formatCountdown(targetDate.value, { showDays: options.showDays });

    // [DECISION LOG] Expiry triggers a one-time callback to notify callers (e.g., store refresh).
    if (!wasEnded && formattedValue.value === "Ended" && options.onExpiry) {
      options.onExpiry();
    }
  }

  onMounted(() => {
    update();
    // [THREAT:] Uncontrolled timers can cause memory leaks or performance degradation.
    // [DECISION LOG] Standardizing on 1s tick for UI countdowns.
    timer = setInterval(update, 1000);
  });

  onUnmounted(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  // Ensure immediate reactivity if targetDate changes between ticks
  watch(targetDate, () => {
    update();
  }, { immediate: true });

  return formattedValue;
}
