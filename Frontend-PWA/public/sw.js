// Service Worker for Clash Manager
// Handles background tasks and badging offload

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", async (event) => {
  if (!event.data) return;

  // Handle Badge Updates
  if (event.data.type === "SET_BADGE") {
    const count = event.data.count;
    try {
      if (navigator.setAppBadge) {
        if (count > 0) {
          await navigator.setAppBadge(count);
        } else {
          await navigator.clearAppBadge();
        }
      }
    } catch (e) {
      console.error("[SW] Failed to set badge", e);
    }
  }

  // Handle Local Notifications (Improvement #2)
  if (event.data.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

// Periodic Sync for Background Updates (Improvement #1)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "update-badge") {
    // Logic to fetch new data would go here
    // For now we just keep the service active
    // console.log("[SW] Periodic sync triggered");
  }
});

// Deep Linking (Improvement #8)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Action Button handling (Improvement #3)
  if (event.action === "open") {
    // Specific logic for open action if needed
  }

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window if none
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
