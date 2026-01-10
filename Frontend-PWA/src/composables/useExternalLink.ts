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
      // 🏛️ TAURI 2.0: Optimized global API access for remote WebViews
      const tauri = (window as any).__TAURI__;
      if (typeof window !== "undefined" && tauri) {
        // Use global shell if available to avoid dynamic import failures on remote origins
        const shell = tauri.shell || (tauri.plugins && tauri.plugins.shell);
        if (shell && shell.open) {
          await shell.open(url);
          return;
        }
        
        // Fallback to dynamic import
        try {
          const { open } = await import("@tauri-apps/plugin-shell");
          await open(url);
          return;
        } catch (innerErr) {
          console.warn("[Tauri] Shell plugin import failed, falling back to window.open");
        }
      }

      // 🚀 BROWSER / PWA FALLBACK:
      // Note: On Android WebView, window.open with custom schemes often triggers ERR_UNKNOWN_URL_SCHEME.
      // We prioritize the system browser for deep links if possible.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Failed to open external link:", e);
      error("Could not open link");
    }
  }

  async function openInGame(tag: string) {
    const id = cleanTag(tag);
    if (!id) return;

    // 200IQ UNIVERSAL LINK STRATEGY:
    // Instead of using clashroyale:// which is blocked by WebViews, we use the official HTTPS App-Link.
    // This leverages Android/iOS Universal Links to trigger the app via a standard HTTPS navigation.
    // If the app is installed, it opens; if not, it gracefully degrades to a webpage.
    const universalUrl = `https://link.clashroyale.com/en?playerInfo?id=${id}`;
    
    const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;
    
    if (isTauri) {
      // For Tauri, we still prefer the Shell plugin to ensure it opens in the OS browser/handler
      // This prevents the WebView from trying (and potentially failing) to load the link itself.
      await openExternal(universalUrl);
      return;
    }

    // For Browsers/PWA: Standard navigation works best as the system will intercept the App-Link.
    window.location.assign(universalUrl);
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
