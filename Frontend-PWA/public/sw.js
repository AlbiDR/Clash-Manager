// Service Worker for Clash Manager
// Optimized for Native System Compatibility (WebAPK)
import { precacheAndRoute } from "workbox-precaching";

// 📦 PRECACHE: This list is injected automatically by workbox-build
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * 🛠 NATIVE ICON BADGE & NOTIFICATION HANDLERS
 */
self.addEventListener("message", async (event) => {
  if (!event.data) return;

  // 🖥️ NON-ANDROID: Standard Badge API (Windows, macOS, iOS Safari)
  if (event.data.type === "SET_BADGE") {
    const count = event.data.count;
    try {
      if (self.navigator.setAppBadge) {
        if (count > 0) await self.navigator.setAppBadge(count);
        else await self.navigator.clearAppBadge();
      }
    } catch (e) {
      console.warn("[SW] Badge update failed", e);
    }
  }

  // 🤖 ANDROID: Badge via persistent notification
  // Android doesn't support direct Badge API - only notifications create app icon badges
  if (event.data.type === "BADGE_NOTIFICATION_ANDROID") {
    const { count, threshold = 75 } = event.data;
    try {
      if (count > 0) {
        // Show persistent silent notification to trigger Android badge
        await self.registration.showNotification("Elite Recruits Available", {
          body: `${count} candidate${count > 1 ? "s" : ""} above ${threshold} score threshold`,
          icon: "pwa-192.png",
          badge: "pwa-64.png",
          tag: "badge-persistent", // Always replaces previous badge notification
          silent: true,
          requireInteraction: false,
          data: { type: "badge", count, timestamp: Date.now() },
        });
      } else {
        // Clear badge by closing the persistent notification
        const notifications = await self.registration.getNotifications({
          tag: "badge-persistent",
        });
        notifications.forEach((n) => n.close());
      }
    } catch (e) {
      console.warn("[SW] Android badge notification failed", e);
    }
  }

  if (event.data.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    self.registration.showNotification(title, {
      icon: "pwa-192.png",
      badge: "pwa-64.png",
      tag: "clash-manager-alert",
      ...options,
    });
  }
});

/**
 * 📲 PUSH NOTIFICATIONS (Server-initiated badge updates)
 * Enables future integration with push notification services
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json?.() ?? {};

  // Handle server-sent badge updates
  if (payload.badgeCount !== undefined) {
    event.waitUntil(handlePushBadge(payload));
  } else if (payload.title) {
    // Standard push notification
    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body || "",
        icon: "pwa-192.png",
        badge: "pwa-64.png",
        tag: payload.tag || "push-alert",
        data: payload.data || {},
      }),
    );
  }
});

/**
 * 🔢 Handle push-initiated badge updates
 */
async function handlePushBadge(payload) {
  const { badgeCount, title, body, threshold = 75 } = payload;

  // Always show notification for Android (creates badge)
  // Also good UX for other platforms
  if (badgeCount > 0) {
    await self.registration.showNotification(
      title || "Elite Recruits Available",
      {
        body:
          body ||
          `${badgeCount} candidate${badgeCount > 1 ? "s" : ""} above ${threshold} score threshold`,
        icon: "pwa-192.png",
        badge: "pwa-64.png",
        tag: "badge-persistent",
        silent: true,
        data: { type: "badge", count: badgeCount },
      },
    );
  }

  // Also try standard Badge API for platforms that support it
  try {
    if (self.navigator.setAppBadge) {
      if (badgeCount > 0) await self.navigator.setAppBadge(badgeCount);
      else await self.navigator.clearAppBadge();
    }
  } catch (e) {
    // Silent fail - notification is primary on Android anyway
  }
}

/**
 * ⚡ PERIODIC BACKGROUND SYNC
 * Registered via the frontend, this allows the WebAPK to refresh recruiter
 * data even when the app is in the background.
 */
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "update-recruit-badge") {
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  try {
    // 1. Recover GAS URL and settings from IndexedDB
    const db = await openDB();
    const gasUrl = await getValue(db, "cm_gas_url");
    if (!gasUrl) return;

    // Read configurable threshold (defaults to 75)
    const threshold = (await getValue(db, "cm_notification_threshold")) || 75;

    // 2. Fetch Fresh Data (Silent)
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "getwebappdata" }),
    });

    const json = await response.json();
    if (json?.status === "success" && json?.data) {
      // 3. Update Badge (Android-compatible via notification)
      const data = json.data;
      if (data.hh) {
        const count = data.hh.filter((r) => r.s >= threshold).length;

        // 🤖 ANDROID: Use persistent notification (creates app icon badge)
        if (count > 0) {
          await self.registration.showNotification("Elite Recruits Available", {
            body: `${count} candidate${count > 1 ? "s" : ""} above ${threshold} score threshold`,
            icon: "pwa-192.png",
            badge: "pwa-64.png",
            tag: "badge-persistent",
            silent: true,
            requireInteraction: false,
            data: { type: "badge", count, timestamp: Date.now() },
          });
        } else {
          // Clear badge notification
          const notifications = await self.registration.getNotifications({
            tag: "badge-persistent",
          });
          notifications.forEach((n) => n.close());
        }

        // 🖥️ OTHER PLATFORMS: Also try standard Badge API
        try {
          if (self.navigator.setAppBadge) {
            if (count > 0) await self.navigator.setAppBadge(count);
            else await self.navigator.clearAppBadge();
          }
        } catch (e) {
          // Silent fail
        }
      }
    }
  } catch (e) {
  } catch (e) {
    console.error("[SW] Background sync failed", e);
  }
}

/**
 * 🔄 ONE-TIME BACKGROUND SYNC (Recovery)
 * Retries failed API requests when connectivity returns.
 */
self.addEventListener("sync", (event) => {
  if (event.tag === "offline-queue-sync") {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  try {
    const db = await openDB();
    const queue = (await getValue(db, "offline_queue")) || [];
    const gasUrl = await getValue(db, "cm_gas_url");

    if (!queue.length || !gasUrl) return;

    // Process serial or parallel? Serial to preserve order usually better for state.
    const remaining = [];
    
    for (const req of queue) {
      try {
        await fetch(gasUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify(req),
        });
      } catch (e) {
        // Prepare to retry if still failing
        if (remaining.length < 50) remaining.push(req); // Cap queue size
      }
    }

    // Update queue in IDB
    // We need a helper to set values - adding it now
    await setValue(db, "offline_queue", remaining);

    if (remaining.length === 0) {
      // Notify client tabs? Optionally via postMessage
    }
  } catch (e) {
    console.error("[SW] Queue sync failed", e);
  }
}

function setValue(db, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["keyval"], "readwrite");
    const store = transaction.objectStore("keyval");
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 🎲 MINIMAL IDB HELPER FOR SW
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("keyval-store", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getValue(db, key) {
  return new Promise((resolve) => {
    const transaction = db.transaction(["keyval"], "readonly");
    const store = transaction.objectStore("keyval");
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

/**
 * 🔗 NATIVE DEEP LINKING
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      // Otherwise open the app
      if (clients.openWindow)
        return clients.openWindow("/Clash-Manager/#/recruiter");
    }),
  );
});
