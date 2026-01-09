import { useToast } from "./useToast";

/**
 * 🔗 USE EXTERNAL LINK
 * Centralized logic for opening external URLs.
 * Handles Tauri Shell API vs Standard Window handling.
 */
export function useExternalLink() {
  const { error } = useToast();

  async function openExternal(url: string) {
    try {
      // Check for Tauri environment
      if (typeof window.__TAURI__ !== 'undefined') {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
        return;
      }
      
      // Fallback: Standard Web/PWA
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
         // Pop-up blocker detection
         console.warn("External link blocked or failed to open");
      }
    } catch (e) {
      console.error("Failed to open external link:", e);
      error("Could not open link");
    }
  }

  return {
    openExternal
  };
}
