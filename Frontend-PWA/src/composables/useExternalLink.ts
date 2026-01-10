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
      if (typeof window !== "undefined" && (window as any).__TAURI__) {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open external link:", e);
      error("Could not open link");
    }
  }

  /**
   * 👑 OPEN IN GAME
   * Robust deep-linking to Clash Royale using Android Intent fallback.
   */
  async function openInGame(tag: string) {
    const id = cleanTag(tag);
    if (!id) return;

    const isAndroid = /android/i.test(navigator.userAgent);
    const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;

    if (isAndroid) {
      // 🚀 Android Intent protocol: Most reliable way to open apps from browser/Webview
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.supercell.clashroyale;` +
        `end`;

      if (isTauri) {
        window.location.href = intentUrl;
      } else {
        // Direct navigation for mobile browsers to ensure reliability
        window.location.assign(intentUrl);
      }
      return;
    }

    // Fallback for iOS/Desktop: Standard scheme
    await openExternal(`clashroyale://playerInfo?id=${id}`);
  }

  return {
    openExternal,
    openInGame,
  };
}
