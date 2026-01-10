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

  async function openInGame(tag: string) {
    const id = cleanTag(tag);
    if (!id) return;

    const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;
    
    // 🏛️ TAURI COMPATIBILITY: 
    // Always use the shell plugin for custom schemes within the Tauri app.
    // Setting window.location.href to custom schemes in a WebView triggers ERR_UNKNOWN_URL_SCHEME.
    if (isTauri) {
      await openExternal(`clashroyale://playerInfo?id=${id}`);
      return;
    }

    // 🚀 BROWSER / PWA COMPATIBILITY:
    const url = buildDeepLink(tag);
    if (url.startsWith("intent://")) {
      window.location.assign(url);
    } else {
      await openExternal(url);
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

  const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
  
  if (isAndroid) {
    // 🚀 Android Intent protocol: Most reliable way to open apps from browser/Webview
    return (
      `intent://playerInfo?id=${id}#Intent;` +
      `scheme=clashroyale;` +
      `package=com.supercell.clashroyale;` +
      `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.supercell.clashroyale;` +
      `end`
    );
  }

  // Fallback for iOS/Desktop: Standard scheme
  return `clashroyale://playerInfo?id=${id}`;
}
