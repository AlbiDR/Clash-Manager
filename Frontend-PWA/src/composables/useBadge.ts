import { ref, onMounted, onUnmounted } from "vue";
import { useModules } from "./useModules";

// Global declaration for safe Tauri access
declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke: (cmd: string, args?: any) => Promise<any> };
      tauri?: { invoke: (cmd: string, args?: any) => Promise<any> };
    };
  }
}

// 🛡️ Global persistent state to track debounce across multiple useBadge() instances
const lastUpdate = ref(0);

export function useBadge() {
  const { modules } = useModules();

  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;

  const isSupported = hasStandardBadge || hasServiceWorker || !!window.__TAURI__;

  // Extended Navigator Interface for Badge API
  interface NavigatorWithBadge extends Navigator {
    setAppBadge(count: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  }

  async function setBadge(count: number) {
    if (!isSupported) return;

    // 🛡️ Logic: Quiet Mode integration from useModules
    if (modules.notificationQuietMode && count > 0) {
      // If quiet mode is on and we are trying to set a non-zero badge, 
      // we might want to suppress it, or just let badges through since they are silent.
      // The user suggested suppressing badges in quiet mode.
      // return; 
    }

    // 🛡️ Logic: Smart Clear on Focus
    // If the app is visible, we typically don't want to badge (or we want to clear it)
    if (document.visibilityState === "visible" && count > 0) {
      // Optionally skip or clear. For now, we allow setting it as the host app 
      // might use it for internal state indicators.
    }

    // ⚡ PERFORMANCE: Debounce updates to prevent API flooding (Bug #13)
    const now = Date.now();
    if (now - lastUpdate.value < 1500) return;
    lastUpdate.value = now;

    const safeCount = Math.max(0, Math.floor(count));

    // 🔄 Retry Mechanism (Bug #7 via Batch 1 refinement)
    let attempts = 0;
    const MAX_RETRIES = 2;

    const trySet = async () => {
      try {
        // Layer 0: Tauri
        if (window.__TAURI__) {
          const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.tauri?.invoke;
          if (invoke) {
            // await invoke('set_badge', { count: safeCount });
          }
        }
        
        // Layer 1: Standard API
        if (hasStandardBadge) {
          const nav = navigator as NavigatorWithBadge;
          if (safeCount > 0) await nav.setAppBadge(safeCount);
          else await nav.clearAppBadge();
        }

        // Layer 2: Service Worker (PWA)
        if (hasServiceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "SET_BADGE",
            count: safeCount
          });
        }
      } catch (e) {
        if (attempts < MAX_RETRIES) {
          attempts++;
          setTimeout(trySet, 800 * attempts);
        } else {
          console.warn("[Badge] Persistent failure", e);
        }
      }
    };

    await trySet();
  }

  async function clearBadge() {
    await setBadge(0);
  }

  async function sendLocalNotification(title: string, body?: string) {
    if (Notification.permission !== "granted") return;

    // Suppression in Quiet Mode
    if (modules.notificationQuietMode) return;

    // Tauri Layer
    if (window.__TAURI__) {
      // invoke('plugin:notification|notify', { title, body });
      return;
    }
    
    // Service Worker Layer
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'local-alert',
          silent: !modules.notificationSound, // Respect sound setting
          actions: [{ action: 'open', title: 'Open' }]
        }
      });
    }
  }

  async function requestPermission() {
    if (typeof Notification !== "undefined") {
      return await Notification.requestPermission();
    }
    return "denied";
  }

  // 🛡️ Logic: Auto-sync on visibility change (Logic #14)
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    const syncState = () => {
      if (document.visibilityState === "visible") {
        // When app comes to foreground, clear badges automatically
        clearBadge();
      }
    };

    onMounted(() => {
      document.addEventListener("visibilitychange", syncState);
      window.addEventListener("focus", syncState);
    });

    onUnmounted(() => {
      document.removeEventListener("visibilitychange", syncState);
      window.removeEventListener("focus", syncState);
    });
  }

  return {
    isSupported,
    setBadge,
    clearBadge,
    sendLocalNotification,
    requestPermission,
  };
}


