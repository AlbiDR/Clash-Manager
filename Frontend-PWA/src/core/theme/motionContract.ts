// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/** The three explicit ways an operator can resolve app motion. */
export type MotionPreference = "system" | "reduced" | "standard";

export const MOTION_STORAGE_KEY = "cm_motion_preference";

/** Validates persisted motion data before it can reach the document root. */
export function resolveMotionPreference(preference: string | null): MotionPreference {
  if (preference === "reduced" || preference === "standard") return preference;
  return "system";
}

/**
 * Runs before the module graph so the first rendered frame has the intended
 * motion policy. CSS owns the system-media-query branch; this script owns only
 * the persisted explicit preference.
 */
export const BOOT_MOTION_SCRIPT = `
    (function() {
      var preference = localStorage.getItem("${MOTION_STORAGE_KEY}");
      var resolved = preference === "reduced" || preference === "standard" ? preference : "system";
      document.documentElement.setAttribute("data-motion-preference", resolved);
    })();
  `;
