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

    console.log('[openInGame] Starting with tag:', tag, 'cleaned:', id);

    const userAgent = navigator.userAgent;
    console.log('[openInGame] UserAgent:', userAgent);

    // CRITICAL: Detect if we're in Tauri even when __TAURI__ is undefined
    // This happens when the app loads from a remote URL (GitHub Pages)
    const isTauri = typeof window !== "undefined" && (
      (window as any).__TAURI__ !== undefined ||
      userAgent.includes('Tauri') ||
      // Android WebView in Tauri has specific patterns
      (userAgent.includes('wv') && userAgent.includes('Android'))
    );
    
    const isAndroid = /android/i.test(userAgent);
    console.log('[openInGame] Environment - Tauri:', isTauri, 'Android:', isAndroid);

    // STRATEGY: On Android (app or browser), ALWAYS use intent:// URLs
    // They work reliably in both Tauri WebView and Chrome
    if (isAndroid) {
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.supercell.clashroyale;` +
        `end`;
      console.log('[openInGame] Android mode - using programmatic link click:', intentUrl);
      
      // NUCLEAR SOLUTION: Create a hidden anchor and click it programmatically
      // This is the most reliable way to trigger intents in WebViews because:
      // 1. It simulates a real user click
      // 2. WebViews trust user-initiated navigation
      // 3. It bypasses popup blockers and security restrictions
      try {
        const anchor = document.createElement('a');
        anchor.href = intentUrl;
        anchor.style.display = 'none';
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        
        // Add to DOM (required for some browsers)
        document.body.appendChild(anchor);
        
        // Programmatically click
        console.log('[openInGame] Clicking hidden anchor');
        anchor.click();
        
        // Cleanup after a short delay
        setTimeout(() => {
          document.body.removeChild(anchor);
          console.log('[openInGame] Anchor cleaned up');
        }, 1000);
        
        console.log('[openInGame] Intent triggered successfully');
      } catch (err) {
        console.error('[openInGame] Programmatic click failed:', err);
        // Final fallback
        console.log('[openInGame] Trying direct location.href as last resort');
        window.location.href = intentUrl;
      }
      return;
    }

    // For iOS/Desktop: Try multiple fallbacks
    const directUrl = `clashroyale://playerInfo?id=${id}`;
    
    // If Tauri is detected and APIs are available, use Shell plugin
    if (isTauri) {
      console.log('[openInGame] Tauri detected, attempting Shell plugin');
      try {
        const tauri = (window as any).__TAURI__;
        if (tauri) {
          const shell = tauri.shell || (tauri.plugins?.shell);
          if (shell?.open) {
            console.log('[openInGame] Using Tauri shell.open()');
            await shell.open(directUrl);
            return;
          }
        }
      } catch (err) {
        console.error('[openInGame] Tauri shell failed:', err);
      }
    }

    // Final fallback: Try direct window.location (works on iOS)
    console.log('[openInGame] Fallback: using window.location.href');
    try {
      window.location.href = directUrl;
    } catch (err) {
      console.error('[openInGame] window.location failed:', err);
      error('Failed to open game - app may not be installed');
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
