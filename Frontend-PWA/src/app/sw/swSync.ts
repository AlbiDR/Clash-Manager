// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { openDB, getValue } from "./swKernel";
import { NOTIFICATION_TAG_RECRUIT, NOTIFICATION_SHORTCUT_ID } from "../../core/config";

/**
 * SW SYNC (Layer 4 Sub-module)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestrates background data synchronization and push notification
 * logic for the Service Worker. Extracted from sw.ts for modularity.
 *
 * @remarks
 * Satisfies ADR Section II (Layer 4: App) and Section IV (Tiered Caching Protocol).
 * Acts as the background orchestrator for offline-first notifications.
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
 * @param payload - The push notification payload containing badge count and text.
 * @returns A promise that resolves when the notification is shown or skipped.
 *
 * @sideeffects
 * - Shows a browser notification via `self.registration.showNotification`.
 * - Updates the app badge via `navigator.setAppBadge`.
 */
export async function handlePushBadge(payload: PushPayload): Promise<void> {
  const { badgeCount, title, body } = payload;

  const db = await openDB();

  // [THREAT:] Unvalidated IndexedDB ingress.
  // [DECISION LOG] We default to enabled (true) if the key is missing to ensure
  // users receive critical updates by default unless they explicitly opted out.
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
        tag: NOTIFICATION_TAG_RECRUIT,
        renotify: false,
        silent: false,
        data: {
          type: "badge",
          count: badgeCount,
          shortcutId: NOTIFICATION_SHORTCUT_ID,
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
 *
 * @remarks
 * Implements "Direct View Access" strategy by querying the headhunter_view
 * directly via PostgREST to minimize Edge Function invocation costs.
 *
 * @returns A promise that resolves when the sync is complete.
 *
 * @sideeffects
 * - Queries the remote Supabase REST API.
 * - Shows or clears browser notifications.
 * - Updates the app badge.
 */
export async function handleBackgroundSync(): Promise<void> {
  try {
    const db = await openDB();

    // [THREAT:] Notification permission guards.
    // [DECISION LOG] Background sync is aborted if notifications are disabled in app settings
    // to preserve battery and data, even if the browser registration is active.
    const enabled = (await getValue(db, "cm_notifications_enabled")) !== false;
    if (!enabled) {
      console.log("[SW] Background sync skipped: Notifications disabled");
      return;
    }

    // [THREAT:] Configuration drift.
    // [DECISION LOG] We retrieve connectivity secrets directly from IDB to avoid
    // hardcoding production URLs in the service worker script.
    const supabaseUrl = await getValue(db, "cm_supabase_url") as string;
    if (!supabaseUrl) return;

    const threshold = (await getValue(db, "cm_notification_threshold") as number) || 75;

    const supabaseKey = await getValue(db, "cm_supabase_key") as string;
    if (!supabaseKey) return;

    // [DECISION LOG] Direct View Access: We query the view with aliasing (s:potential_score)
    // to reduce payload size and decouple from internal database column naming.
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
          tag: NOTIFICATION_TAG_RECRUIT,
          renotify: false,
          silent: false,
          requireInteraction: false,
          data: {
            type: "badge",
            count,
            shortcutId: NOTIFICATION_SHORTCUT_ID,
            url: "/#/headhunter",
            timestamp: Date.now(),
          },
        } as NotificationOptions);
      } else {
        const notifications = await self.registration.getNotifications({
          tag: NOTIFICATION_TAG_RECRUIT,
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
