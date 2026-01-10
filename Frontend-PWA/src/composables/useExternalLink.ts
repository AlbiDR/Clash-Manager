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

    const isTauri = typeof window !== "undefined" && (window as any).__TAURI__;
    console.log('[openInGame] Environment - Tauri:', isTauri, 'UserAgent:', navigator.userAgent);

    // STRATEGY 1: Direct clashroyale:// scheme (most reliable if Shell plugin works)
    const directUrl = `clashroyale://playerInfo?id=${id}`;
    
    if (isTauri) {
      console.log('[openInGame] Tauri detected - trying Shell plugin with URL:', directUrl);
      
      try {
        // Try accessing global Tauri API
        const tauri = (window as any).__TAURI__;
        console.log('[openInGame] Global __TAURI__ object:', tauri ? 'Found' : 'Missing');
        
        if (tauri) {
          // Method 1: Try global shell directly
          const shell = tauri.shell || (tauri.plugins?.shell);
          console.log('[openInGame] Shell API:', shell ? 'Found' : 'Missing');
          
          if (shell?.open) {
            console.log('[openInGame] Attempting shell.open() with:', directUrl);
            await shell.open(directUrl);
            console.log('[openInGame] shell.open() succeeded');
            return;
          }

          // Method 2: Try dynamic import
          console.log('[openInGame] Trying dynamic import of @tauri-apps/plugin-shell');
          try {
            const { open } = await import("@tauri-apps/plugin-shell");
            console.log('[openInGame] Dynamic import succeeded, calling open()');
            await open(directUrl);
            console.log('[openInGame] Dynamic import open() succeeded');
            return;
          } catch (importErr) {
            console.error('[openInGame] Dynamic import failed:', importErr);
          }
        }

        // Method 3: Try invoking through Tauri core
        if (tauri?.core?.invoke) {
          console.log('[openInGame] Trying tauri.core.invoke()');
          try {
            await tauri.core.invoke('plugin:shell|open', { path: directUrl });
            console.log('[openInGame] core.invoke succeeded');
            return;
          } catch (invokeErr) {
            console.error('[openInGame] core.invoke failed:', invokeErr);
          }
        }

        console.warn('[openInGame] All Tauri methods failed, falling back to window.location');
      } catch (tauriErr) {
        console.error('[openInGame] Tauri error:', tauriErr);
      }

      // Fallback for Tauri: Try direct window.location (might trigger OS handler)
      console.log('[openInGame] Tauri fallback: trying window.location.href');
      try {
        window.location.href = directUrl;
        return;
      } catch (locationErr) {
        console.error('[openInGame] window.location.href failed:', locationErr);
        error(`Failed to open game: ${locationErr}`);
        return;
      }
    }

    // For Web/PWA: Use Android Intent on Android, clashroyale:// on iOS
    console.log('[openInGame] Web/PWA mode');
    const isAndroid = /android/i.test(navigator.userAgent);
    
    if (isAndroid) {
      // Android Intent (works in mobile browsers)
      const intentUrl =
        `intent://playerInfo?id=${id}#Intent;` +
        `scheme=clashroyale;` +
        `package=com.supercell.clashroyale;` +
        `S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.supercell.clashroyale;` +
        `end`;
      console.log('[openInGame] Using Android Intent:', intentUrl);
      window.location.assign(intentUrl);
    } else {
      // iOS or other platforms
      console.log('[openInGame] Using direct scheme:', directUrl);
      await openExternal(directUrl);
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
