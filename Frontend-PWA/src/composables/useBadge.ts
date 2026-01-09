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
    if (!isSupported) {
      console.warn("[Badge] No badge API available");
      return;
    }

    try {
      // Layer 1: Standard Badge API (Native)
      if (hasStandardBadge) {
        if (count > 0) {
          await (navigator as NavigatorWithBadge).setAppBadge(count);
        } else {
          await (navigator as NavigatorWithBadge).clearAppBadge();
        }
        // console.log(`[Badge] Set via standard API: ${count}`);
        // We continue to SW layer because on some mobile browsers setAppBadge exists but does nothing for the home screen icon
      }

      // Layer 2: Experimental Badge API
      if (hasExperimentalBadge && !hasStandardBadge) {
        if (count > 0) {
          await (navigator as NavigatorWithBadge).setExperimentalAppBadge(count);
        } else {
          await (navigator as NavigatorWithBadge).clearExperimentalAppBadge();
        }
        // console.log(`[Badge] Set via experimental API: ${count}`);
      }

      // Layer 3: Service Worker Badge (CRITICAL FOR ANDROID FALLBACK)
      if (hasServiceWorker) {
        const sendToSW = (reg: ServiceWorkerRegistration) => {
          if (reg.active) {
            reg.active.postMessage({
              type: "SET_BADGE",
              count: count > 0 ? count : 0,
            });
            // console.log(`[Badge] Message sent to Service Worker: ${count}`);
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
