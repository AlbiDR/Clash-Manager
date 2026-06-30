// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/// <reference lib="webworker" />

// Service Worker for Clash Manager
// Optimized for Native System Compatibility (WebAPK)
import { precacheAndRoute, matchPrecache } from "workbox-precaching";
import {
  openDB,
  getValue,
  handlePushBadge,
  handleBackgroundSync,
  handleAndroidBadge,
} from "./sw/index";
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
      } catch (navigationPreloadError: unknown) {
        console.warn("[SW] Navigation preload activation failed", navigationPreloadError);
      }

      await self.clients.claim();

      // [SELF-HEAL] CRITICAL: force every controlled tab to reload once this new
      // version activates. Navigation is cache-first (matchPrecache below), so a
      // tab that was already open keeps rendering the STALE precached shell + stale
      // chunks indefinitely — skipWaiting/claim alone never re-runs the document.
      // Driving the reload from the SW is the ONLY mechanism that reaches clients
      // still running an OLD shell (which predates any client-side update listener).
      // This is what un-sticks browsers wedged on a prior broken deploy.
      //
      // Cost: a genuinely-fresh first install also reloads once here — standard,
      // near-invisible PWA behavior (the app re-renders instantly from cache).
      // It does NOT loop: a stable version never re-activates, so no further reload.
      try {
        const windowClients = await self.clients.matchAll({ type: "window" });
        for (const client of windowClients) {
          if ("navigate" in client && typeof client.navigate === "function") {
            client.navigate(client.url).catch(() => {
              /* client may be mid-unload; ignore */
            });
          }
        }
      } catch (selfHealError: unknown) {
        console.warn("[SW] Client self-heal reload failed", selfHealError);
      }
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
    /**
     * [OPTIMIZATION] Native-Like Navigation Strategy (Cache-First)
     * To achieve sub-second "native" startup latency in the hybrid shell, we
     * prioritize the precached app shell (index.html) for all navigation requests.
     * This bypasses the network completely for the initial document load.
     */
    event.respondWith(
      (async () => {
        const cachedShell = await matchPrecache("/Clash-Manager/index.html");
        if (cachedShell) {
          return cachedShell;
        }

        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          return await fetch(event.request);
        } catch (fetchError: unknown) {
          throw fetchError;
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
    } catch (badgeUpdateError: unknown) {
      console.warn("[SW] Badge update failed", badgeUpdateError);
    }
  }

  // ANDROID: Badge via persistent notification
  if (data.type === "BADGE_NOTIFICATION_ANDROID") {
    await handleAndroidBadge(data.count ?? 0);
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
      const storageConnection = await openDB();
      const notificationsAreEnabled =
        (await getValue(storageConnection, "cm_notifications_enabled")) !== false;
      if (!notificationsAreEnabled) return;

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
