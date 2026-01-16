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
      // ⚡ OVERRIDE ATTEMPT 1: Set badge BEFORE notification
      if (self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(count);
      }

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

        // ⚡ OVERRIDE ATTEMPT 2: Set badge AFTER notification (with delay)
        // Some launchers re-evaluate badge count when a notification arrives.
        // We wait for the launcher to finish its "auto-count" and then try to nudge it.
        setTimeout(async () => {
          if (self.navigator.setAppBadge) {
             await self.navigator.setAppBadge(count);
          }
        }, 300);

      } else {
        // Clear badge by closing the persistent notification
        const notifications = await self.registration.getNotifications({
          tag: "badge-persistent",
        });
        notifications.forEach((n) => n.close());
        if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
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
    // 1. Recover GAS URL from IndexedDB
    const db = await openDB();
    const gasUrl = await getValue(db, "cm_gas_url");
    if (!gasUrl) return;

    // 2. Fetch Fresh Data (Silent)
    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "getwebappdata" }),
    });

    const json = await response.json();
    if (json?.status === "success" && json?.data) {
      // 3. Update Badge (Android Home Screen integration)
      const data = json.data;
      if (data.hh && self.navigator.setAppBadge) {
        const threshold = 75; // Default threshold
        const count = data.hh.filter((r) => r.s >= threshold).length;
        // 🤖 ANDROID: Use persistent notification (creates app icon badge)
        if (count > 0) {
          // ⚡ OVERRIDE ATTEMPT 1: Set badge BEFORE notification
          if (self.navigator.setAppBadge) {
            await self.navigator.setAppBadge(count);
          }

          await self.registration.showNotification("Elite Recruits Available", {
            body: `${count} candidate${count > 1 ? "s" : ""} above ${threshold} score threshold`,
            icon: "pwa-192.png",
            badge: "pwa-64.png",
            tag: "badge-persistent",
            silent: true,
            requireInteraction: false,
            data: { type: "badge", count, timestamp: Date.now() },
          });

          // ⚡ OVERRIDE ATTEMPT 2: Set badge AFTER notification (with delay)
          setTimeout(async () => {
            if (self.navigator.setAppBadge) {
              await self.navigator.setAppBadge(count);
            }
          }, 300);

        } else {
          // Clear badge notification
          const notifications = await self.registration.getNotifications({
            tag: "badge-persistent",
          });
          notifications.forEach((n) => n.close());
          if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
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
