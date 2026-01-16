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
        if (count > 0) await self.navigator.setAppBadge(count);
        else await self.navigator.clearAppBadge();
      }
    }
  } catch (e) {
    console.error("[SW] Background sync failed", e);
  }
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
