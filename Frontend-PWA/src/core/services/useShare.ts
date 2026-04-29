// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * SHARE BROKER (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides a unified interface for the Web Share API.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service acts as a hardware broker for the device's native sharing capabilities.
 * It abstracts the Web Share API and provides defensive error handling for
 * common failure modes like user cancellation.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** This is a leaf node in the dependency graph.
 */

/**
 * COMPOSABLE: useShare
 *
 * @remarks
 * Brokered access to native sharing.
 *
 * @returns
 * - `canShare`: Boolean indicating if the Web Share API is available on the current device.
 * - `share`: Method to trigger the native share sheet.
 */
export function useShare() {
  /**
   * Indicates if the Web Share API is supported by the current browser environment.
   */
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  /**
   * Triggers the native sharing interface.
   *
   * @remarks
   * Handles `AbortError` silently, as it typically indicates the user cancelled the operation.
   * Logs other errors to the console for diagnostic purposes.
   *
   * @param data - The object containing data to be shared (title, text, url, files).
   */
  async function share(data: ShareData) {
    if (!canShare) {
      console.warn("Web Share API not supported");
      return;
    }

    try {
      await navigator.share(data);
    } catch (err) {
      // Logic: Ignore AbortError as it represents an intentional user action (cancelling the share).
      if ((err as Error).name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  }

  return {
    canShare,
    share,
  };
}
