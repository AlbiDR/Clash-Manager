// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { ref } from "vue";

/**
 * [UX] USE LONG PRESS
 * Provides a standardized long-press gesture with built-in haptic feedback.
 */
export function useLongPress(callback: () => void, duration = 400) {
  const isLongPressActive = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function start() {
    isLongPressActive.value = false;
    timer = setTimeout(() => {
      isLongPressActive.value = true;
      
      // Standardized Selection Haptic (Medium pulse)
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(60);
      }
      callback();
    }, duration);
  }

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

