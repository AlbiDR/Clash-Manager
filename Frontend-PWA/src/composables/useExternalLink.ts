import { useToast } from "./useToast";
import { cleanTag } from "../utils/formatters";

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

    // STRATEGY: On Android (app or browser), we try multiple layers of escalation
    if (isAndroid) {
      const directUrl = `clashroyale://playerInfo?id=${id}`;
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `end`;

      console.log("[openInGame] Android mode - attempting escalation");

      try {
        // Layer 1: The direct anchor click (No _blank, to keep it in context)
        const anchor = document.createElement("a");
        anchor.href = directUrl; // Try direct scheme first
        anchor.style.display = "none";

        document.body.appendChild(anchor);
        anchor.click();

        // ⚡ FALLBACK: If the direct scheme fails to trigger, the page usually stays still.
        // We wait 150ms and if no visibility change happened, we fire the Intent layer.
        setTimeout(() => {
          if (document.body.contains(anchor)) {
            anchor.href = intentUrl;
            anchor.click();

            setTimeout(() => {
              if (document.body.contains(anchor))
                document.body.removeChild(anchor);
            }, 500);
          }
        }, 150);

        console.log("[openInGame] Direct/Intent escalation fired");
      } catch (err) {
        console.error("[openInGame] Escalated click failed:", err);
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
