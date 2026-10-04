// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { readonly, ref } from "vue";
import type { WindowWithBridge } from "../types";

const isPowerSaving = ref(false);
let isInitialized = false;

/** Re-reads the native state rather than trusting a page event's payload. */
function refreshPowerSaving() {
  try {
    const bridge = (window as WindowWithBridge).AndroidBridge;
    isPowerSaving.value = bridge?.isPowerSaveMode?.() === true;
  } catch {
    // Older or unavailable shells cannot report the system switch.
    isPowerSaving.value = false;
  }
  document.documentElement?.toggleAttribute("data-power-saving", isPowerSaving.value);
}

/**
 * Shared, event-driven Android Battery Saver state. A browser has no equivalent
 * switch API; its colour-scheme and reduced-motion preferences stay authoritative.
 * This temporary state never changes stored user preferences.
 */
export function usePowerSaving() {
  if (!isInitialized && typeof window !== "undefined") {
    isInitialized = true;
    refreshPowerSaving();
    window.addEventListener("cm-power-save-change", refreshPowerSaving);
    window.addEventListener("focus", refreshPowerSaving);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshPowerSaving();
    });
  }
  return { isPowerSaving: readonly(isPowerSaving) };
}
