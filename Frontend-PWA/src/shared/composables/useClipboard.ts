// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";

export type ClipboardState = "idle" | "copied" | "unavailable";

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

  async function copyText(content: string): Promise<boolean> {
    if (!content || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      clipboardState.value = "unavailable";
      return false;
    }

    try {
      await navigator.clipboard.writeText(content);
      clipboardState.value = "copied";
      return true;
    } catch {
      clipboardState.value = "unavailable";
      return false;
    }
  }

  return {
    clipboardState,
    copyText,
  };
}
