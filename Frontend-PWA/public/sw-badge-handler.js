// Custom Service Worker logic for Push, Periodic Sync, and Badging
// This file is imported into the generated service worker via workbox.importScripts

/* global self */

// 1. BADGE HANDLER
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_BADGE") {
    const count = event.data.count || 0;
    if ("setAppBadge" in self.registration) {
      if (count > 0) {
        self.registration.setAppBadge(count).catch(console.error);
      } else {
        self.registration.clearAppBadge().catch(console.error);
      }
    }
  }
});

// 2. PUSH NOTIFICATIONS
self.addEventListener("push", (event) => {
  console.log("[SW] Push Received:", event.data?.text());

  let data = {
    title: "Clash Manager",
    body: "New update available!",
    icon: "/Clash-Manager/pwa-192x192.png",
    badge: "/Clash-Manager/monochrome-icon-512x512.png",
    tag: "clash-update",
    url: "/Clash-Manager/",
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: { url: data.url },
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "Open App" },
      { action: "close", title: "Dismiss" },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 3. NOTIFICATION CLICK HANDLER
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const urlToOpen = event.notification.data?.url || "/Clash-Manager/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there is already a window tab open with the target URL
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url.includes("/Clash-Manager/") && "focus" in client) {
            return client.focus();
          }
        }
        // If no window client is found, open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      }),
  );
});

// 4. PERIODIC SYNC HANDLER
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "content-sync") {
    console.log("[SW] Periodic Sync triggered: content-sync");
    event.waitUntil(handleBackgroundUpdate());
  }
});

async function handleBackgroundUpdate() {
  try {
    // We can't use the GAS Client directly because it's in the main bundle
    // But we can perform a simple fetch to trigger the SWR cache update
    const gasUrl = await getGasUrlFromCache();
    if (!gasUrl) return;

    console.log("[SW] Fetching fresh data in background...");
    const response = await fetch(`${gasUrl}?action=getwebappdata`);
    if (response.ok) {
      console.log("[SW] Background data refresh successful.");
      // Send message to clients if they are active
      const clients = await self.clients.matchAll();
      clients.forEach((client) => {
        client.postMessage({ type: "DATA_UPDATED", timestamp: Date.now() });
      });
    }
  } catch (e) {
    console.error("[SW] Background update failed:", e);
  }
}

async function getGasUrlFromCache() {
  // Attempt to retrieve GAS URL from stored config or cache
  // This is a bit tricky, usually we'd pass it via message or store in IDB
  // For now, let's assume it's stable or retrieved from IDB if we can.
  return null; // Placeholder: In a real app, we'd use IDB to get the URL
}
