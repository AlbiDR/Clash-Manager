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
 * Satisfies ADR Section I (Core Services) & ADR Section IV (Resilience & Hardware Brokerage).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** This is a leaf node in the dependency graph. May only import
 *   from Layer 1 (@core) or Layer 0 substrate. Forbidden from importing higher layers.
 */

/**
 * Return contract interface for `useShare`.
 *
 * @remarks
 * Defines the public reactive and operational shape of the native sharing composable.
 */
export interface UseShareReturn {
  /** Indicates whether the Web Share API is available in the current browser or environment context. */
  canShare: boolean;
  /** Dispatches an asynchronous native sharing intent to the host operating system. */
  share: (data: ShareData) => Promise<void>;
}

/**
 * COMPOSABLE: useShare
 *
 * @remarks
 * Brokered access to native sharing capabilities provided by the host environment.
 * Evaluates Web Share API availability safely during SSR / headless evaluation
 * and provides non-throwing invocation for dismissed or aborted sharing sheets.
 *
 * @returns Object conforming to `UseShareReturn` containing availability check and dispatch method.
 */
export function useShare(): UseShareReturn {
  /**
   * Indicates if the Web Share API is supported by the current browser environment.
   *
   * @remarks
   * [GUARD] Environment Check: Verifies navigator global presence and feature availability
   * before invoking hardware-level sharing mechanisms.
   */
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  /**
   * Triggers the native sharing interface.
   *
   * @remarks
   * [THREAT:] Unhandled promise rejections or runtime failures during native intent dispatch.
   * [DECISION LOG] Handles `AbortError` silently, as it represents an intentional user action
   * (cancelling or closing the native share sheet without selecting a target).
   * Logs other unexpected errors to the console for diagnostic observability.
   *
   * @param data - The payload object containing data to be shared (title, text, url, files).
   * @returns A Promise resolving when sharing completes or is dismissed by the operator.
   */
  async function share(data: ShareData): Promise<void> {
    if (!canShare) {
      console.warn("Web Share API not supported");
      return;
    }

    try {
      await navigator.share(data);
    } catch (shareError) {
      // [DECISION LOG] Ignore AbortError: represents an intentional user cancellation rather than a runtime failure.
      if ((shareError as Error).name !== "AbortError") {
        console.error("Share failed:", shareError);
      }
    }
  }

  return {
    canShare,
    share,
  };
}
