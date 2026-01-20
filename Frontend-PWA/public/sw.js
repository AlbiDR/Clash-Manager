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
  // Mirrors Native Kotlin RecruitmentNotificationService logic
  if (event.data.type === "BADGE_NOTIFICATION_ANDROID") {
    const { count = 0, threshold = 75 } = event.data;

    // Logic: Frontend already filtered this count based on threshold.
    const countAboveThreshold = Math.max(0, count);

    try {
      const db = await openDB();
      const enabled =
        (await getValue(db, "cm_notifications_enabled")) !== false;

      // 1. UPDATE BADGE (The "Number" on the Icon)
      // Corresponds to setNumber() in native
      if (self.navigator.setAppBadge) {
        if (countAboveThreshold > 0 && enabled) {
          await self.navigator.setAppBadge(countAboveThreshold);
        } else {
          await self.navigator.clearAppBadge();
        }
      }

      // 2. SHOW/UPDATE NOTIFICATION
      // Corresponds to Recruits Notification + Summary
      if (countAboveThreshold > 0 && enabled) {
        // We use a fixed tag to act as a "Group" and prevent cluttering the shade.
        // This effectively implements the "Summary" behavior by keeping a single
        // up-to-date entry.
        await self.registration.showNotification("New Recruits Available", {
          body: `You have ${countAboveThreshold} recruit${countAboveThreshold === 1 ? "" : "s"} above your threshold.`,
          icon: "pwa-192.png",
          badge: "pwa-64.png", // Small icon for the status bar
          tag: "com.app.RECRUIT_UPDATES", // Matches GROUP_KEY_RECRUITS
          channelId: "headhunter-channel",

          // "Notification Cooldown": Prevent sound/vibrate on simple updates
          renotify: false,
          silent: false, // First one makes sound, updates are silent due to renotify: false handling if we wanted (but web defaults to silent update if tag matches)
          // Actually, renotify: true means "play sound again". false means "don't".
          // We want it to be silent if it's just an update, but maybe audible if it's new?
          // For now, mirroring "silent: true" from previous code or "setOnlyAlertOnce"?
          // The user's Kotlin says: "Notification Cooldown (using setOnlyAlertOnce(true))".
          // In Web, modifying an existing notification (same tag) doesn't vibrate unless renotify: true.
          // So default is good.

          requireInteraction: false,

          // Custom data to bridge potential TWA/Native gaps
          data: {
            type: "badge",
            count: countAboveThreshold,
            shortcutId: "recruit_shortcut_id", // Matches Kotlin setShortcutId
            url: "/#/recruiter",
          },
        });
      } else {
        // Clear notifications if count drops below threshold
        const notifications = await self.registration.getNotifications({
          tag: "com.app.RECRUIT_UPDATES",
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

  event.waitUntil(
    (async () => {
      // Check if notifications are enabled globally
      const db = await openDB();
      const enabled =
        (await getValue(db, "cm_notifications_enabled")) !== false; // Default to true
      if (!enabled) return;

      // Handle server-sent badge updates
      if (payload.badgeCount !== undefined) {
        await handlePushBadge(payload);
      } else if (payload.title) {
        // Standard push notification
        await self.registration.showNotification(payload.title, {
          body: payload.body || "",
          icon: "pwa-192.png",
          badge: "pwa-64.png",
          tag: payload.tag || "push-alert",
          data: payload.data || {},
        });
      }
    })(),
  );
});

/**
 * 🔢 Handle push-initiated badge updates
 */
async function handlePushBadge(payload) {
  const { badgeCount, title, body, threshold = 75 } = payload;

  const db = await openDB();
  const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;

  // Always show notification for Android (creates badge)
  // Also good UX for other platforms
  if (badgeCount > 0 && enabled) {
    await self.registration.showNotification(
      title || "New Recruits Available",
      {
        body:
          body ||
          `You have ${badgeCount} recruit${badgeCount === 1 ? "" : "s"} above your threshold.`,
        icon: "pwa-192.png",
        badge: "pwa-64.png",
        tag: "com.app.RECRUIT_UPDATES",
        renotify: false,
        silent: false,
        data: {
          type: "badge",
          count: badgeCount,
          shortcutId: "recruit_shortcut_id",
          url: "/#/recruiter",
        },
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

    // 🛡️ SECURITY/UX: Check if notifications are enabled
    const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;
    if (!enabled) {
      console.log("[SW] Background sync skipped: Notifications disabled");
      return;
    }

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
          // ⚡ OVERRIDE ATTEMPT 1: Set badge BEFORE notification
          if (self.navigator.setAppBadge) {
            await self.navigator.setAppBadge(count);
          }

          await self.registration.showNotification("New Recruits Available", {
            body: `You have ${count} recruit${count === 1 ? "" : "s"} above your threshold.`,
            icon: "pwa-192.png",
            badge: "pwa-64.png",
            tag: "com.app.RECRUIT_UPDATES",
            channelId: "headhunter-channel",
            renotify: false,
            silent: false, // Ensure it's not totally silent so it can update badge count on some launchers
            requireInteraction: false,
            data: {
              type: "badge",
              count,
              shortcutId: "recruit_shortcut_id",
              url: "/#/recruiter",
              timestamp: Date.now(),
            },
          });
        } else {
          // Clear badge notification
          const notifications = await self.registration.getNotifications({
            tag: "com.app.RECRUIT_UPDATES",
          });
          notifications.forEach((n) => n.close());
          if (self.navigator.clearAppBadge)
            await self.navigator.clearAppBadge();
        }
      }
    }
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
