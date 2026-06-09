// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useToast } from "./useToast";
import { cleanTag } from "@core";

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
    // [STRATEGY] Native Bridge: Inside the Android WebView, window.open is blocked.
    // Delegate to the native bridge which calls startActivity(ACTION_VIEW) directly.
    const bridge = (window as any).AndroidBridge;
    if (bridge?.openExternalUrl) {
      bridge.openExternalUrl(url);
      return;
    }

    try {
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

    // [STRATEGY] Native Bridge: The custom WebView intercepts shouldOverrideUrlLoading
    // for intent:// only for direct navigations, not for anchor target=_blank clicks.
    // Calling the bridge method directly bypasses WebView routing entirely.
    const bridge = (window as any).AndroidBridge;
    if (bridge?.openPlayerProfile) {
      bridge.openPlayerProfile(id);
      return;
    }

    const isAndroid = /android/i.test(navigator.userAgent);

    if (isAndroid) {
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `end`;
      try {
        window.location.href = intentUrl;
      } catch (err) {
        console.error("[openInGame] intent href failed:", err);
        error("Failed to open game - app may not be installed");
      }
      return;
    }

    // iOS / Desktop fallback
    try {
      window.location.href = `clashroyale://playerInfo?id=${id}`;
    } catch (err) {
      console.error("[openInGame] clashroyale:// failed:", err);
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
