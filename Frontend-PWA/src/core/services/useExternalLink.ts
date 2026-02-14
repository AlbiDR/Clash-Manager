import { useToast } from "./useToast";
import { cleanTag } from "@core/utils/formatters";

/**
 * 🔗 USE EXTERNAL LINK
 * Centralized logic for opening external URLs and deep links.
 */
export function useExternalLink() {
  const { error } = useToast();

  async function openExternal(url: string) {
    try {
      // 🚀 BROWSER / PWA FALLBACK:
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

  async function openInGame(tag: string) {
    const id = cleanTag(tag);
    if (!id) return;

    console.log("[openInGame] Starting with tag:", tag, "cleaned:", id);

    const userAgent = navigator.userAgent;
    console.log("[openInGame] UserAgent:", userAgent);

    const isAndroid = /android/i.test(userAgent);
    console.log("[openInGame] Environment - Android:", isAndroid);

    // STRATEGY: On Android, use Intent URL directly for maximum reliability
    if (isAndroid) {
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `end`;

      console.log("[openInGame] Android mode - using direct intent");

      try {
        // Create a temporary anchor for the intent
        const anchor = document.createElement("a");
        anchor.href = intentUrl;
        anchor.style.display = "none";
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";

        document.body.appendChild(anchor);
        anchor.click();

        // Clean up immediately - the intent will handle the app launch
        setTimeout(() => {
          if (document.body.contains(anchor)) {
            document.body.removeChild(anchor);
          }
        }, 100);

        console.log("[openInGame] Intent triggered successfully");
      } catch (err) {
        console.error("[openInGame] Intent click failed:", err);
        // Last resort: direct location change
        window.location.href = intentUrl;
      }
      return;
    }

    // For iOS/Desktop: Try multiple fallbacks
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
 * 🔗 BUILD DEEP LINK
 * Generates the correct URL for Clash Royale based on platform.
 */
export function buildDeepLink(tag: string): string {
  const id = cleanTag(tag);
  if (!id) return "";

  const isAndroid =
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

  if (isAndroid) {
    // 🚀 Android Intent protocol: Most reliable way to open apps from browser/Webview
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
