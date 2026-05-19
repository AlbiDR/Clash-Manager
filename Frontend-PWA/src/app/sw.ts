/// <reference lib="webworker" />

// Service Worker for Clash Manager
// Optimized for Native System Compatibility (WebAPK)
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };
declare const clients: Clients;

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

interface SyncEvent extends ExtendableEvent {
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

interface AppData {
  hh?: Array<{ s: number }>;
  [key: string]: unknown;
}

/**
 * [ADR] Service Worker Data Bridge: Optimized for minimal footprint.
 * Bypasses full client libraries to minimize worker bundle size.
 */
interface SupabaseRow {
  s: number;
}

// Precache assets injected by workbox-build
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
    const { count = 0, threshold = 75 } = data;
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
          tag: "com.app.RECRUIT_UPDATES",
          renotify: false,
          silent: false,
          requireInteraction: false,
          data: {
            type: "badge",
            count: countAboveThreshold,
            shortcutId: "recruit_shortcut_id",
            url: "/#/headhunter",
          },
        } as NotificationOptions);
      } else {
        const notifications = await self.registration.getNotifications({
          tag: "com.app.RECRUIT_UPDATES",
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
 * Handle push-initiated badge updates
 */
async function handlePushBadge(payload: PushPayload): Promise<void> {
  const { badgeCount, title, body, threshold = 75 } = payload;

  const db = await openDB();
  const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;

  if (badgeCount && badgeCount > 0 && enabled) {
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
          url: "/#/headhunter",
        },
      } as NotificationOptions,
    );
  }

  try {
    if (self.navigator.setAppBadge) {
      if (badgeCount && badgeCount > 0)
        await self.navigator.setAppBadge(badgeCount);
      else await self.navigator.clearAppBadge();
    }
  } catch (e) {
    // Silent fail
  }
}

/**
 * Periodic background sync
 */
self.addEventListener("periodicsync", (event: Event) => {
  const periodicEvent = event as PeriodicSyncEvent;
  if (periodicEvent.tag === "update-recruit-badge") {
    periodicEvent.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync(): Promise<void> {
  try {
    const db = await openDB();

    const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;
    if (!enabled) {
      console.log("[SW] Background sync skipped: Notifications disabled");
      return;
    }

    const supabaseUrl = await getValue(db, "cm_supabase_url");
    if (!supabaseUrl) return;

    const threshold = (await getValue(db, "cm_notification_threshold") as number) || 75;

    const supabaseKey = await getValue(db, "cm_supabase_key");
    if (!supabaseKey) return;

    // [ADR] Direct View Access: Querying the headhunter_view directly with column aliasing.
    // This removes the dependency on the restricted 'get_pwa_data' RPC.
    const response = await fetch(`${supabaseUrl}/rest/v1/headhunter_view?select=s:potential_score`, {
      method: "GET",
      headers: { 
        "apikey": supabaseKey as string,
        "Accept-Profile": "features"
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const recruits = (await response.json()) as SupabaseRow[];
    
    if (Array.isArray(recruits)) {
      const count = recruits.filter((r) => r.s >= threshold).length;

      if (count > 0) {
        if (self.navigator.setAppBadge) {
          await self.navigator.setAppBadge(count);
        }

        await self.registration.showNotification("New Recruits Available", {
          body: `You have ${count} recruit${count === 1 ? "" : "s"} above your threshold.`,
          icon: "pwa-192.png",
          badge: "pwa-64.png",
          tag: "com.app.RECRUIT_UPDATES",
          renotify: false,
          silent: false,
          requireInteraction: false,
          data: {
            type: "badge",
            count,
            shortcutId: "recruit_shortcut_id",
            url: "/#/headhunter",
            timestamp: Date.now(),
          },
        } as NotificationOptions);
      } else {
        const notifications = await self.registration.getNotifications({
          tag: "com.app.RECRUIT_UPDATES",
        });
        notifications.forEach((n) => n.close());
        if (self.navigator.clearAppBadge)
          await self.navigator.clearAppBadge();
      }
    }
  } catch (e) {
    console.error("[SW] Background sync failed", e);
  }
}

/**
 * One-time background sync (recovery)
 */
self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === "offline-queue-sync") {
    syncEvent.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue(): Promise<void> {
  try {
    const db = await openDB();
    const queue = ((await getValue(db, "offline_queue")) || []) as unknown[];
    const supabaseUrl = await getValue(db, "cm_supabase_url") as string | null;
    const supabaseKey = await getValue(db, "cm_supabase_key") as string | null;

    if (!queue.length || !supabaseUrl || !supabaseKey) return;

    const remaining: unknown[] = [];

    for (const action of queue) {
      if (!action || typeof action !== "object") continue;

      const typedAction = action as { type?: string; items?: unknown[]; ids?: string[] };

      try {
        // [FIX] OFFLINE QUEUE: Call the correct RPCs directly.
        // Rationale: The previous `process_queue` RPC does not exist in the backend.
        // Each queued action must be dispatched to its correct endpoint.
        if (typedAction.type === "RECRUIT_DISMISSAL" && Array.isArray(typedAction.items)) {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/dismiss_recruits`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Content-Profile": "features",
            },
            body: JSON.stringify({ items: typedAction.items }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } else if (typedAction.type === "RECRUIT_RESTORATION" && Array.isArray(typedAction.ids)) {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/undismiss_recruits`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Content-Profile": "features",
            },
            body: JSON.stringify({ player_tags: typedAction.ids }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        // Action processed successfully; do not add to remaining.
      } catch {
        // Preserve unprocessed items for the next sync attempt.
        if (remaining.length < 50) remaining.push(action);
      }
    }

    await setValue(db, "offline_queue", remaining);
  } catch (e) {
    console.error("[SW] Queue sync failed", e);
  }
}

const DB_NAME = "clash_manager_v11";
const STORE_NAME = "keyval";
const DB_VERSION = 1;

function setValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Minimal IDB helper for service worker
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getValue(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

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
