// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useToast } from "./useToast";
import { cleanTag } from "@core/utils/formatters";

/**
 * COMPOSABLE: useExternalLink
 *
 * @remarks
 * Centralized logic for opening external URLs and deep links.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 * - **Responsibility:** Hardware Brokerage (OS Intents and Browser Navigation).
 *
 * This service implements a dual-path strategy for deep linking into Clash Royale:
 * 1. Android Path: Uses the `intent://` protocol to ensure the app is opened even from
 *    sandboxed WebViews or Chrome Custom Tabs.
 * 2. iOS/Desktop Path: Uses the standard `clashroyale://` URI scheme.
 *
 * @returns
 * - `openExternal`: Opens a URL in a new browser tab.
 * - `openInGame`: Attempts to open a specific player profile in Clash Royale.
 * - `buildDeepLink`: Generates the platform-specific deep link string.
 */
export function useExternalLink() {
  const { error } = useToast();

  /**
   * Opens an external URL in a new browser tab.
   *
   * @param url - The full destination URL.
   */
  async function openExternal(url: string) {
    try {
      // [LOGIC] BROWSER / PWA FALLBACK:
      // Note: On Android WebView, window.open with custom schemes often triggers ERR_UNKNOWN_URL_SCHEME.
      // We prioritize the system browser for deep links if possible.
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        console.warn("External link blocked or failed to open");
      }
    } catch (e) {
      console.error("Failed to open external link:", e);
      error("Could not open link");
    }
  }

  /**
   * Attempts to open the Clash Royale application to a specific player profile.
   *
   * @param tag - The player tag to open.
   */
  async function openInGame(tag: string) {
    const id = cleanTag(tag);
    if (!id) return;

    console.log("[openInGame] Starting with tag:", tag, "cleaned:", id);

    const userAgent = navigator.userAgent;
    console.log("[openInGame] UserAgent:", userAgent);

    const isAndroid = /android/i.test(userAgent);
    console.log("[openInGame] Environment - Android:", isAndroid);

    // [STRATEGY] Android Intent: Use direct Intent URL for maximum reliability.
    // Rationale: The intent scheme allows specifying the package name, which prevents
    // the browser from showing the "Open with..." dialog or failing in WebViews.
    if (isAndroid) {
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `end`;

      console.log("[openInGame] Android mode - using direct intent");

      try {
        // [LOGIC] Temporary Anchor: Creates a hidden DOM element to trigger the intent.
        // Rationale: Directly setting window.location.href can sometimes be blocked
        // by pop-up blockers or cause navigation loops in certain PWA contexts.
        const anchor = document.createElement("a");
        anchor.href = intentUrl;
        anchor.style.display = "none";
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        document.body.appendChild(anchor);
        anchor.click();

        // [LOGIC] Anchor Cleanup: Removes the element after a short delay.
        // Rationale: 100ms provides enough time for the browser to register the click
        // without dropping the current PWA process state during the context switch.
        setTimeout(() => {
          if (document.body.contains(anchor)) {
            document.body.removeChild(anchor);
          }
        }, 100);

        console.log("[openInGame] Intent triggered successfully");
      } catch (err) {
        console.error("[openInGame] Intent click failed:", err);
        // Fallback: direct location change if anchor method fails.
        window.location.href = intentUrl;
      }
      return;
    }

    // [STRATEGY] iOS/Desktop Fallback: Try multiple methods for standard schemes.
    const directUrl = `clashroyale://playerInfo?id=${id}`;

    // Final fallback: Try direct window.location (works on iOS)
    console.log("[openInGame] Fallback: using window.location.href");
    try {
      window.location.href = directUrl;
    } catch (err) {
      console.error("[openInGame] window.location failed:", err);
      error("Failed to open game - app may not be installed");
    }
  }

  return {
    openExternal,
    openInGame,
    buildDeepLink,
  };
}

/**
 * Generates the correct URL for Clash Royale based on platform.
 *
 * @param tag - The player tag to link.
 * @returns A platform-specific deep link or intent string.
 */
export function buildDeepLink(tag: string): string {
  const id = cleanTag(tag);
  if (!id) return "";

  const isAndroid =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  if (isAndroid) {
    // [STRATEGY] Android Intent protocol: Most reliable way to open apps from browser/Webview.
    return (
      `intent://playerInfo?id=${id}#Intent;` +
      `scheme=clashroyale;` +
      `package=com.supercell.clashroyale;` +
      `end`
    );
  }

  // Fallback for iOS/Desktop: Standard scheme
  return `clashroyale://playerInfo?id=${id}`;
}
