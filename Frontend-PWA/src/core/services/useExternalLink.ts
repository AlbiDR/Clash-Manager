// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useToast } from "./useToast";
import { useNativeBridge } from "./useNativeBridge";
// [CYCLE GUARD] Direct source imports, NOT the @core barrel (which re-exports this
// module) - barrel self-imports form an evaluation cycle that TDZ-crashes the app
// when the service worker serves all chunks at once.
import { cleanTag } from "../utils/text";

/**
 * Contract representing the capabilities exposed by the `useExternalLink` service.
 *
 * @remarks
 * Satisfies ADR Section I: Core Services & Hardware Brokerage.
 * Exposes methods to launch external URLs in the host browser or dispatch custom
 * deep links to native game clients.
 */
export interface UseExternalLinkReturn {
  /**
   * Opens an external destination URL in the host browser or through the native bridge.
   *
   * @param url - The complete HTTP/HTTPS destination URL.
   * @returns A promise that resolves once navigation has been initiated.
   */
  openExternal: (url: string) => Promise<void>;

  /**
   * Attempts to launch Clash Royale directly to a specific player's profile view.
   *
   * @param tag - The player tag string (with or without `#` prefix).
   * @returns A promise that resolves once the intent or scheme dispatch has been executed.
   */
  openInGame: (tag: string) => Promise<void>;

  /**
   * Constructs the appropriate platform-specific URI/intent string for a player tag.
   *
   * @param tag - The player tag to build the link for.
   * @returns A platform-tailored deep-link string (`intent://...` on Android, `clashroyale://...` otherwise).
   */
  buildDeepLink: (tag: string) => string;
}

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
 * @returns Interface contract `UseExternalLinkReturn` containing navigation methods.
 */
export function useExternalLink(): UseExternalLinkReturn {
  const { error } = useToast();
  const { bridge: nativeBridge } = useNativeBridge();

  /**
   * Opens an external URL in a new browser tab or via the Android native container bridge.
   *
   * @remarks
   * Handles pop-up blockers, headless WebView restrictions, and unhandled navigation errors
   * gracefully by falling back to user-visible toast notifications.
   *
   * @param url - The full destination URL.
   */
  async function openExternal(url: string): Promise<void> {
    // [STRATEGY] Native Bridge: Inside the Android WebView, window.open is blocked.
    // Delegate to the native bridge which calls startActivity(ACTION_VIEW) directly.
    // [THREAT:] Unvalidated hardware boundaries and 'any' pathogens.
    // [DECISION LOG] Utilizing strict type narrowing for WindowWithBridge to
    // eliminate 'any' casts and ensure hardware bridge access integrity.
    if (nativeBridge.value?.openExternalUrl) {
      nativeBridge.value.openExternalUrl(url);
      return;
    }

    try {
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        console.warn("External link blocked or failed to open");
      }
    } catch (externalLinkError: unknown) {
      const errorMessage = externalLinkError instanceof Error ? externalLinkError.message : String(externalLinkError);
      console.error("Failed to open external link:", errorMessage);
      error("Could not open link");
    }
  }

  /**
   * Attempts to open the Clash Royale application to a specific player profile.
   *
   * @remarks
   * Sanitizes the input player tag with `cleanTag`, checks for native container bridge
   * capability first, and falls back to platform-specific URI protocols (`intent://` on Android
   * and `clashroyale://` on iOS/Desktop).
   *
   * @param tag - The player tag to open.
   */
  async function openInGame(tag: string): Promise<void> {
    const id = cleanTag(tag);
    if (!id) return;

    // [STRATEGY] Native Bridge: The custom WebView intercepts shouldOverrideUrlLoading
    // for intent:// only for direct navigations, not for anchor target=_blank clicks.
    // Calling the bridge method directly bypasses WebView routing entirely.
    // [THREAT:] Hardware desynchronization if calling 'any' methods on Window.
    // [DECISION LOG] Enforcing the WindowWithBridge contract to secure player profile navigation.
    if (nativeBridge.value?.openPlayerProfile) {
      nativeBridge.value.openPlayerProfile(id);
      return;
    }

    const isAndroid = /android/i.test(navigator.userAgent);

    if (isAndroid) {
      // [DECISION LOG] Compose explicit Android Intent URI format to trigger com.supercell.clashroyale
      // without relying on browser default protocol handlers.
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `end`;
      try {
        window.location.href = intentUrl;
      } catch (deepLinkError: unknown) {
        // [THREAT:] Unhandled navigation rejection when host lacks corresponding intent handler.
        const errorMessage = deepLinkError instanceof Error ? deepLinkError.message : String(deepLinkError);
        console.error("[openInGame] intent href failed:", errorMessage);
        error("Failed to open game - app may not be installed");
      }
      return;
    }

    // iOS / Desktop fallback
    try {
      // [DECISION LOG] Use standard registered scheme for iOS and desktop browser environments.
      window.location.href = `clashroyale://playerInfo?id=${id}`;
    } catch (deepLinkError: unknown) {
      // [THREAT:] Unhandled protocol handler failure when Clash Royale is not installed.
      const errorMessage = deepLinkError instanceof Error ? deepLinkError.message : String(deepLinkError);
      console.error("[openInGame] clashroyale:// failed:", errorMessage);
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
 * @remarks
 * Strips formatting/hash characters from player tags and constructs the platform-specific
 * intent or protocol URL.
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
