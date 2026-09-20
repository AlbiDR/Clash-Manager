// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import {
  MOTION_STORAGE_KEY,
  resolveMotionPreference,
  type MotionPreference,
} from "../../core/theme/motionContract";

export type { MotionPreference };

const motionPreference = ref<MotionPreference>("system");
const isInitialized = ref(false);

/**
 * COMPOSABLE: useMotionPreference
 *
 * A Layer 2 browser-preference broker. The operating system remains the
 * default authority; a deliberate local setting can reduce motion further or
 * restore the app's standard, token-driven motion language.
 */
export function useMotionPreference() {
  function applyMotionPreference() {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-motion-preference", motionPreference.value);
  }

  function setMotionPreference(nextPreference: MotionPreference) {
    motionPreference.value = nextPreference;
    localStorage.setItem(MOTION_STORAGE_KEY, nextPreference);
    applyMotionPreference();
  }

  function init() {
    if (isInitialized.value || typeof window === "undefined") return;

    motionPreference.value = resolveMotionPreference(localStorage.getItem(MOTION_STORAGE_KEY));
    applyMotionPreference();
    isInitialized.value = true;
  }

  return {
    motionPreference,
    setMotionPreference,
    init,
  };
}
