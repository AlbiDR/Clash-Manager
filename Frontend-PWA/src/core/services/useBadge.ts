import { ref, onMounted, onUnmounted } from "vue";
import { useAppSettings } from "@core";
import { useBroadcastChannel } from "./useBroadcastChannel";

// 🛡️ Global persistent state to track debounce across multiple useBadge() instances
const lastUpdate = ref(0);

// 🤖 ANDROID DETECTION: Android doesn't support navigator.setAppBadge() directly
// Badges on Android only appear via active notifications
const isAndroid =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

export function useBadge() {
  const { modules } = useAppSettings();

  // 📡 Broadcast Channel Integration
  const { post: broadcast } = useBroadcastChannel((msg) => {
    if (msg.type === "BADGE_UPDATE") {
      // Don't recurse - just set internal state or notify SW if needed
      // For now, we trust the sender also updated the SW/Badge API
    }
  });

  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;

  // Android has setAppBadge but it doesn't work - only notifications create badges
  const isSupported = hasServiceWorker || (!isAndroid && hasStandardBadge);

  // Extended Navigator Interface for Badge API
  interface NavigatorWithBadge extends Navigator {
    setAppBadge(count: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  }

  /**
   * 🤖 ANDROID: Set badge via persistent notification
   * Android doesn't support direct Badge API - only notifications create app icon badges
   */
  async function setBadgeViaNotification(count: number) {
    if (!hasServiceWorker || !navigator.serviceWorker.controller) return;

    navigator.serviceWorker.controller.postMessage({
      type: "BADGE_NOTIFICATION_ANDROID",
      count,
      threshold: modules.notificationThreshold || 75,
    });
  }

  /**
   * 🖥️ NON-ANDROID: Use standard Badge API
   */
  async function setDirectBadge(count: number) {
    if (hasStandardBadge) {
      const nav = navigator as NavigatorWithBadge;
      if (count > 0) await nav.setAppBadge(count);
      else await nav.clearAppBadge();
    }

    // Also notify service worker for consistency
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SET_BADGE",
        count,
      });
    }
  }

  async function setBadge(count: number) {
    if (!isSupported) return;

    // 🛡️ Logic: Quiet Mode integration from useAppSettings
    if (modules.notificationQuietMode && count > 0) {
      // Suppress badges in quiet mode on Android (since they require notifications)
      if (isAndroid) return;
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
        // 🤖 ANDROID: Use notification-based badges
        if (isAndroid) {
          await setBadgeViaNotification(safeCount);
        } else {
          // 🖥️ OTHER PLATFORMS: Use direct Badge API
          await setDirectBadge(safeCount);
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

    // 📡 Broadcast to other tabs so they know the badge count changed
    broadcast({ type: "BADGE_UPDATE", count: safeCount });
  }

  async function clearBadge() {
    await setBadge(0);
  }

  async function sendLocalNotification(
    title: string,
    body?: string,
    channelId?: string,
  ) {
    if (Notification.permission !== "granted") return;

    // Suppression in Quiet Mode
    if (modules.notificationQuietMode) return;

    // Service Worker Layer
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: "local-alert",
          channelId, // Optional: for Headhunter channel
          silent: !modules.notificationSound, // Respect sound setting
          actions: [{ action: "open", title: "Open" }],
        },
      });
    }
  }

  async function requestPermission() {
    if (typeof Notification !== "undefined") {
      return await Notification.requestPermission();
    }
    return "denied";
  }

  // 🛡️ Logic: Auto-clear removed to support persistent notifications (#Request-Persistence)
  // Badges will now only clear when data changes (recruits dismissed) or explicitly cleared.

  return {
    isSupported,
    setBadge,
    clearBadge,
    sendLocalNotification,
    requestPermission,
  };
}
