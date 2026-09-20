// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getCurrentScope, onScopeDispose, ref } from "vue";

export type ClipboardState = "idle" | "copied" | "unavailable";

/** The brief, consistent acknowledgement window after a successful explicit copy. */
export const CLIPBOARD_FEEDBACK_DURATION_MS = 2_000;

interface CopyTextOptions {
  /** Set to `0` when the caller owns a separate acknowledgement lifecycle. */
  feedbackDurationMs?: number;
}

/**
 * COMPOSABLE: useClipboard
 *
 * @remarks
 * A small Layer 2 browser-API broker for explicit copy affordances. It keeps
 * components from reaching into `navigator.clipboard` directly and exposes a
 * presentational state the caller can render without catching transport errors.
 */
export function useClipboard() {
  const clipboardState = ref<ClipboardState>("idle");
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

  function clearClipboardFeedback() {
    if (feedbackTimer !== undefined) {
      clearTimeout(feedbackTimer);
      feedbackTimer = undefined;
    }
  }

  function scheduleClipboardReset(feedbackDurationMs: number) {
    if (feedbackDurationMs <= 0) return;

    feedbackTimer = setTimeout(() => {
      clipboardState.value = "idle";
      feedbackTimer = undefined;
    }, feedbackDurationMs);
  }

  async function copyText(
    content: string,
    { feedbackDurationMs = CLIPBOARD_FEEDBACK_DURATION_MS }: CopyTextOptions = {},
  ): Promise<boolean> {
    clearClipboardFeedback();

    if (!content || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      clipboardState.value = "unavailable";
      return false;
    }

    try {
      await navigator.clipboard.writeText(content);
      clipboardState.value = "copied";
      scheduleClipboardReset(feedbackDurationMs);
      return true;
    } catch {
      clipboardState.value = "unavailable";
      return false;
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(clearClipboardFeedback);
  }

  return {
    clipboardState,
    copyText,
  };
}
