// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { VISIBILITY_REFRESH_THRESHOLD } from "../config";

/**
 * [UTILITY] VISIBILITY REFRESH REGISTRY
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes logic for triggering revalidation when the app
 * regains focus (visibility change). Enforces a standardized time-based
 * threshold to prevent redundant network requests.
 * ----------------------------------------------------------------------------
 *
 * @param onRefresh - Callback function to execute when a refresh is required.
 * @returns A cleanup function to remove the event listener.
 */
export function registerVisibilityRefresh(onRefresh: () => void | Promise<void>): () => void {
  let lastVisibilityTime = Date.now();

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      const now = Date.now();
      const hiddenDuration = now - lastVisibilityTime;

      // [DECISION LOG] AUTOMATIC REVALIDATION
      // Only trigger refresh if the app has been in the background for more
      // than the VISIBILITY_REFRESH_THRESHOLD (defined in core config).
      if (hiddenDuration > VISIBILITY_REFRESH_THRESHOLD) {
        onRefresh();
      }
      lastVisibilityTime = now;
    } else {
      lastVisibilityTime = Date.now();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
