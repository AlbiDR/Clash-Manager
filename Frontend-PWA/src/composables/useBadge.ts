// @ts-nocheck
import { ref } from "vue";

export function useBadge() {
  // Check multiple badge API support levels
  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasExperimentalBadge =
    typeof navigator !== "undefined" && "setExperimentalAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;

  const isSupported =
    hasStandardBadge || hasExperimentalBadge || hasServiceWorker;

  // Extended Navigator Interface for Badge API
  interface NavigatorWithBadge extends Navigator {
    setAppBadge(count: number): Promise<void>;
    clearAppBadge(): Promise<void>;
    setExperimentalAppBadge(count: number): Promise<void>;
    clearExperimentalAppBadge(): Promise<void>;
  }

  async function setBadge(count: number) {
    if (!isSupported && !(window as any).__TAURI__) {
      console.warn("[Badge] No badge API available");
      return;
    }

    try {
      // Layer 0: Tauri / Native Android
      // This is the most reliable method if we are in the App Wrapper
      if ((window as any).__TAURI__) {
        try {
          // Attempt to call the Tauri Badge Plugin (if configured)
          const { invoke } = (window as any).__TAURI__.core || (window as any).__TAURI__.tauri;
           // We try a generic 'plugin:badge|set_badge' or similar if it existed, 
           // but since we don't have the rust side here, we will trust the 
           // standard Web APIs to propagate if standard, OR try to set it via
           // a known notification plugin interface if accessible.
           // However, for now, we will assume standard standard API propagation 
           // works better for unmodified Tauri builds unless specifically correctly.
           // We leave this block as a placeholder for specific invoke calls if the user 
           // provides the specific Rust function name.
           // For now, we Fallthrough to Standard Layer as Tauri v2 often proxies this.
        } catch (e) {
           // efficient fallthrough
        }
      }

      // Layer 1: Standard Badge API (Native)
      if (hasStandardBadge) {
        if (count > 0) {
          await (navigator as NavigatorWithBadge).setAppBadge(count);
        } else {
          await (navigator as NavigatorWithBadge).clearAppBadge();
        }
      }

      // Layer 2: Experimental Badge API
      if (hasExperimentalBadge && !hasStandardBadge) {
        if (count > 0) {
          await (navigator as NavigatorWithBadge).setExperimentalAppBadge(count);
        } else {
          await (navigator as NavigatorWithBadge).clearExperimentalAppBadge();
        }
      }

      // Layer 3: Service Worker Badge (CRITICAL FOR ANDROID FALLBACK)
      // This is often the logic that actually works for PWAs installed on Android
      if (hasServiceWorker) {
        const sendToSW = (reg: ServiceWorkerRegistration) => {
          if (reg.active) {
            reg.active.postMessage({
              type: "SET_BADGE",
              count: count > 0 ? count : 0,
            });
          }
        };

        if (navigator.serviceWorker.controller) {
          sendToSW(navigator.serviceWorker.controller);
        } else {
          navigator.serviceWorker.ready.then(sendToSW);
        }
      }
    } catch (e) {
      console.error("[Badge] Failed to update app badge:", e);
    }
  }

  async function clearBadge() {
    await setBadge(0);
  }

  return {
    isSupported,
    setBadge,
    clearBadge,
  };
}
