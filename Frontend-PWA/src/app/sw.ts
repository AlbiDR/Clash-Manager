// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/// <reference lib="webworker" />

// Service Worker for Clash Manager
// Optimized for Native System Compatibility (WebAPK)
import { precacheAndRoute, matchPrecache } from "workbox-precaching";
import { openDB, getValue, handlePushBadge, handleBackgroundSync } from "./sw/index";
import { NOTIFICATION_TAG_RECRUIT, NOTIFICATION_SHORTCUT_ID } from "../core/config";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };
declare const clients: Clients;

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

// Type definitions for service worker
interface BadgeMessageData {
  type: "SET_BADGE";
  count: number;
}

interface AndroidBadgeMessageData {
  type: "BADGE_NOTIFICATION_ANDROID";
  count?: number;
  threshold?: number;
}

interface ShowNotificationMessageData {
  type: "SHOW_NOTIFICATION";
  title: string;
  options?: NotificationOptions;
}

type MessageData =
  | BadgeMessageData
  | AndroidBadgeMessageData
  | ShowNotificationMessageData;

interface PushPayload {
  badgeCount?: number;
  title?: string;
  body?: string;
  tag?: string;
  data?: Record<string, unknown>;
  threshold?: number;
}

// Precache assets injected by workbox-build
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      } catch (e) {
        console.warn("[SW] Navigation preload activation failed", e);
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * [ADR] Custom Navigation Preload Handler
 * Intercepts document requests to consume parallel-fetched responses.
 * Falls back to network or the precached app shell automatically.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Attempt to consume preloaded response if active
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          return await fetch(event.request);
        } catch (error) {
          // Offline/Network error fallback to precached HTML shell
          const cachedShell = await matchPrecache("/Clash-Manager/index.html");
          if (cachedShell) {
            return cachedShell;
          }
          throw error;
        }
      })(),
    );
  }
});

/**
 * Native icon badge & notification handlers
 */
self.addEventListener("message", async (event: ExtendableMessageEvent) => {
  if (!event.data) return;

  const data = event.data as MessageData;

  // NON-ANDROID: Standard Badge API (Windows, macOS, iOS Safari)
  if (data.type === "SET_BADGE") {
    const count = data.count;
    try {
      if (self.navigator.setAppBadge) {
        if (count > 0) await self.navigator.setAppBadge(count);
        else await self.navigator.clearAppBadge();
      }
    } catch (e) {
      console.warn("[SW] Badge update failed", e);
    }
  }

  // ANDROID: Badge via persistent notification
  if (data.type === "BADGE_NOTIFICATION_ANDROID") {
    const { count = 0 } = data;
    const countAboveThreshold = Math.max(0, count);

    try {
      const db = await openDB();
      const enabled =
        (await getValue(db, "cm_notifications_enabled")) !== false;

      // Update badge
      if (self.navigator.setAppBadge) {
        if (countAboveThreshold > 0 && enabled) {
          await self.navigator.setAppBadge(countAboveThreshold);
        } else {
          await self.navigator.clearAppBadge();
        }
      }

      // Show/update notification
      if (countAboveThreshold > 0 && enabled) {
        await self.registration.showNotification("New Recruits Available", {
          body: `You have ${countAboveThreshold} recruit${countAboveThreshold === 1 ? "" : "s"} above your threshold.`,
          icon: "pwa-192.png",
          badge: "pwa-64.png",
          tag: NOTIFICATION_TAG_RECRUIT,
          renotify: false,
          silent: false,
          requireInteraction: false,
          data: {
            type: "badge",
            count: countAboveThreshold,
            shortcutId: NOTIFICATION_SHORTCUT_ID,
            url: "/#/headhunter",
          },
        } as NotificationOptions);
      } else {
        const notifications = await self.registration.getNotifications({
          tag: NOTIFICATION_TAG_RECRUIT,
        });
        notifications.forEach((n) => n.close());
      }
    } catch (e) {
      console.warn("[SW] Android badge notification failed", e);
    }
  }

  if (data.type === "SHOW_NOTIFICATION") {
    const { title, options } = data;
    await self.registration.showNotification(title, {
      icon: "pwa-192.png",
      badge: "pwa-64.png",
      tag: "clash-manager-alert",
      ...options,
    });
  }

  // FORCE UPDATE: Manual skipWaiting via message
  if (data.type === ("SKIP_WAITING" as string)) {
    self.skipWaiting();
  }
});

/**
 * Push notifications (server-initiated badge updates)
 */
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  const payload = (event.data.json?.() ?? {}) as PushPayload;

  event.waitUntil(
    (async (): Promise<void> => {
      const db = await openDB();
      const enabled =
        (await getValue(db, "cm_notifications_enabled")) !== false;
      if (!enabled) return;

      if (payload.badgeCount !== undefined) {
        await handlePushBadge(payload);
      } else if (payload.title) {
        await self.registration.showNotification(payload.title, {
          body: payload.body || "",
          icon: "pwa-192.png",
          badge: "pwa-64.png",
          tag: payload.tag || "push-alert",
          data: payload.data || {},
        } as NotificationOptions);
      }
    })(),
  );
});

/**
 * Periodic background sync
 */
self.addEventListener("periodicsync", (event: Event) => {
  const periodicEvent = event as PeriodicSyncEvent;
  if (periodicEvent.tag === "update-recruit-badge") {
    periodicEvent.waitUntil(handleBackgroundSync());
  }
});

/**
 * Native deep linking
 */
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow)
        return clients.openWindow("/Clash-Manager/#/headhunter");
    }),
  );
});
