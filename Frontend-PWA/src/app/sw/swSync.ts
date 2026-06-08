// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { openDB, getValue } from "./swKernel";

/**
 * SW SYNC (Layer 4 Sub-module)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates background data synchronization and push notification
 * logic for the Service Worker. Extracted from sw.ts for modularity.
 * ----------------------------------------------------------------------------
 */

interface PushPayload {
  badgeCount?: number;
  title?: string;
  body?: string;
  tag?: string;
  data?: Record<string, unknown>;
  threshold?: number;
}

interface SupabaseRow {
  s: number;
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Handle push-initiated badge updates.
 *
 * @param payload - The push notification payload.
 */
export async function handlePushBadge(payload: PushPayload): Promise<void> {
  const { badgeCount, title, body } = payload;

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
 * Executes a background synchronization to update the recruit badge.
 * Direct View Access: Querying the headhunter_view directly with column aliasing.
 */
export async function handleBackgroundSync(): Promise<void> {
  try {
    const db = await openDB();

    const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;
    if (!enabled) {
      console.log("[SW] Background sync skipped: Notifications disabled");
      return;
    }

    const supabaseUrl = await getValue(db, "cm_supabase_url") as string;
    if (!supabaseUrl) return;

    const threshold = (await getValue(db, "cm_notification_threshold") as number) || 75;

    const supabaseKey = await getValue(db, "cm_supabase_key") as string;
    if (!supabaseKey) return;

    const response = await fetch(`${supabaseUrl}/rest/v1/headhunter_view?select=s:potential_score`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
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
