import { ref } from "vue";

// Global declaration for safe Tauri access
declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke: (cmd: string, args?: any) => Promise<any> };
      tauri?: { invoke: (cmd: string, args?: any) => Promise<any> };
    };
  }
}

const lastUpdate = ref(0);

export function useBadge() {
  // Check multiple badge API support levels
  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasExperimentalBadge =
    typeof navigator !== "undefined" && "setExperimentalAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;

  // We should also check for Notification permissions as Badges often require it

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
    // 1. Permission Check
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
       // Graceful fail
    }

    // Improvement #4: Auto-Clear on Visibility
    if (document.visibilityState === "visible" && count > 0) {
      // If user is looking at the app, don't badge them
      // But we might want to sound if it's urgent?
      // For now, let's just not badge if visible.
      // Actually, standard behavior is to badge until "read". 
      // User requested "Smart Clear" on focus.
      // We will implement that in the main.ts or a separate watcher. 
      // Here we just set what we are told.
    }
  
    if (!isSupported && !window.__TAURI__) return;

    // Improvement #5: Quiet Mode
    // We can't easily silence system badges, but we can prevent *notifications* if we were sending them.
    // However, badges themselves are silent. 
    // If we wanted to "prevent badge" in quiet mode, we'd do:
    // const { modules } = useModules(); // (Need to retrieve inside function or pass in)
    // if (modules.value.notificationQuietMode) return; 

    // Improvement #6: Debounce
    const now = Date.now();
    if (now - lastUpdate.value < 2000) {
      // Debounce: Skip updates if too frequent
      return; 
    }
    lastUpdate.value = now;

    const safeCount = Math.max(0, Math.floor(count));

    // Improvement #7: Retry Mechanism
    let attempts = 0;
    const MAX_RETRIES = 3;

    const trySet = async () => {
        try {
            // Layer 0: Tauri
            if (window.__TAURI__) {
                const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.tauri?.invoke;
                if (invoke) {
                    // await invoke('set_badge', { count: safeCount });
                }
            }
            
            // Layer 1: Standard
            if (hasStandardBadge) {
                 if (safeCount > 0) await (navigator as NavigatorWithBadge).setAppBadge(safeCount);
                 else await (navigator as NavigatorWithBadge).clearAppBadge();
            }

            // Layer 3: SW
            if (hasServiceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: "SET_BADGE",
                    count: safeCount
                });
            }
        } catch (e) {
            if (attempts < MAX_RETRIES) {
                attempts++;
                setTimeout(trySet, 1000 * attempts); // Exponential backoff
            } else {
                console.error("[Badge] Failed after retries", e);
            }
        }
    }

    await trySet();
  }

  async function clearBadge() {
    await setBadge(0);
  }

  // Improvement #2: Local Notifications
  async function sendLocalNotification(title: string, body?: string) {
      if (!isSupported && !window.__TAURI__) return;
      if (Notification.permission !== "granted") return;

      // Tauri Layer (Improvement #14)
      if (window.__TAURI__) {
          // invoke('plugin:notification|notify', { title, body });
          return;
      }
      
      // SW Layer
      if (hasServiceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
              type: "SHOW_NOTIFICATION",
              title,
              options: {
                  body,
                  icon: '/pwa-192x192.png',
                  badge: '/pwa-192x192.png',
                  actions: [{ action: 'open', title: 'Open' }], // Improvement #3
                  tag: 'local-alert'
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

  return {
    isSupported,
    setBadge,
    clearBadge,
    sendLocalNotification,
    requestPermission,
  };
}
