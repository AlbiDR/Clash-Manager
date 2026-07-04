// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { openDB, getValue } from "./swKernel";
import { NOTIFICATION_TAG_RECRUIT, NOTIFICATION_SHORTCUT_ID } from "../../core/config";
import * as v from "valibot";
import { SwSupabaseResponseSchema } from "./swSchemas";

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
export async function handlePushBadge(pushNotificationPayload: PushPayload): Promise<void> {
  const { badgeCount, title, body } = pushNotificationPayload;

  const storageConnection = await openDB();

  // [THREAT:] Unvalidated IndexedDB ingress (Target C [1]).
  // [DECISION LOG] We default to enabled (true) if the key is missing to ensure
  // users receive critical updates by default unless they explicitly opted out.
  // Validation ensures that corrupted IDB data doesn't crash the Service Worker.
  const rawEnabled = await getValue(storageConnection, "cm_notifications_enabled");
  const notificationsAreEnabled = v.safeParse(v.boolean(), rawEnabled).success ? (rawEnabled as boolean) : true;

  if (badgeCount && badgeCount > 0 && notificationsAreEnabled) {
    const notificationMetadata = {
      type: "badge",
      count: badgeCount,
      shortcutId: NOTIFICATION_SHORTCUT_ID,
      url: "/#/headhunter",
    };

    await self.registration.showNotification(
      title || "New Recruits Available",
      {
        body:
          body ||
          `You have ${badgeCount} recruit${badgeCount === 1 ? "" : "s"} above your threshold.`,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/icon-64.png",
        tag: NOTIFICATION_TAG_RECRUIT,
        renotify: false,
        silent: false,
        data: notificationMetadata,
      } as NotificationOptions,
    );
  }

  try {
    if (self.navigator.setAppBadge) {
      if (badgeCount && badgeCount > 0)
        await self.navigator.setAppBadge(badgeCount);
      else await self.navigator.clearAppBadge();
    }
  } catch (badgeUpdateError: unknown) {
    // Silent fail for hardware boundary
    console.warn("[SW] Native badge update failed", badgeUpdateError);
  }
}

/**
 * Handle Android-specific badge notifications.
 *
 * @param targetBadgeCount - The number of recruits above threshold.
 * @returns A promise that resolves when the badge/notification is updated.
 *
 * @sideeffects
 * - Shows or clears a browser notification via `self.registration.showNotification`.
 * - Updates the app badge via `navigator.setAppBadge`.
 */
export async function handleAndroidBadge(targetBadgeCount: number): Promise<void> {
  const countAboveThreshold = Math.max(0, targetBadgeCount);

  try {
    const storageConnection = await openDB();

    // [THREAT:] Unvalidated IndexedDB ingress.
    // [DECISION LOG] Default to enabled (true) if key is missing.
    const rawEnabled = await getValue(storageConnection, "cm_notifications_enabled");
    const notificationsAreEnabled = v.safeParse(v.boolean(), rawEnabled).success ? (rawEnabled as boolean) : true;

    // Update badge
    if (self.navigator.setAppBadge) {
      if (countAboveThreshold > 0 && notificationsAreEnabled) {
        await self.navigator.setAppBadge(countAboveThreshold);
      } else {
        await self.navigator.clearAppBadge();
      }
    }

    // Show/update notification
    if (countAboveThreshold > 0 && notificationsAreEnabled) {
      const notificationMetadata = {
        type: "badge",
        count: countAboveThreshold,
        shortcutId: NOTIFICATION_SHORTCUT_ID,
        url: "/#/headhunter",
      };

      await self.registration.showNotification("New Recruits Available", {
        body: `You have ${countAboveThreshold} recruit${countAboveThreshold === 1 ? "" : "s"} above your threshold.`,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/icon-64.png",
        tag: NOTIFICATION_TAG_RECRUIT,
        renotify: false,
        silent: false,
        requireInteraction: false,
        data: notificationMetadata,
      } as NotificationOptions);
    } else {
      const activeNotifications = await self.registration.getNotifications({
        tag: NOTIFICATION_TAG_RECRUIT,
      });
      activeNotifications.forEach((notification) => notification.close());
    }
  } catch (androidBadgeError: unknown) {
    console.warn("[SW] Android badge notification failed", androidBadgeError);
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
    const storageConnection = await openDB();

    // [THREAT:] Notification permission guards.
    // [DECISION LOG] Background sync is aborted if notifications are disabled in app settings
    // to preserve battery and data, even if the browser registration is active.
    const rawEnabled = await getValue(storageConnection, "cm_notifications_enabled");
    const notificationsAreEnabled = v.safeParse(v.boolean(), rawEnabled).success ? (rawEnabled as boolean) : true;

    if (!notificationsAreEnabled) {
      console.log("[SW] Background sync skipped: Notifications disabled");
      return;
    }

    // [THREAT:] Configuration drift and 'any Plague' (Target C [1, 4]).
    // [DECISION LOG] We retrieve connectivity secrets directly from IDB to avoid
    // hardcoding production URLs in the service worker script. Strict validation
    // via Valibot ensures configuration integrity.
    const rawUrl = await getValue(storageConnection, "cm_supabase_url");
    const supabaseUrlValidation = v.safeParse(v.pipe(v.string(), v.url()), rawUrl);
    if (!supabaseUrlValidation.success) return;
    const supabaseUrl = supabaseUrlValidation.output;

    const rawThreshold = await getValue(storageConnection, "cm_notification_threshold");
    const thresholdValidation = v.safeParse(v.pipe(v.number(), v.picklist([50, 75])), rawThreshold);
    const scoreThreshold = thresholdValidation.success ? thresholdValidation.output : 75;

    const rawKey = await getValue(storageConnection, "cm_supabase_key");
    const supabaseKeyValidation = v.safeParse(v.pipe(v.string(), v.minLength(1)), rawKey);
    if (!supabaseKeyValidation.success) return;
    const supabaseKey = supabaseKeyValidation.output;

    // [DECISION LOG] Direct View Access: We query the view with aliasing (s:potential_score)
    // to reduce payload size and decouple from internal database column naming.
    const apiResponse = await fetch(`${supabaseUrl}/rest/v1/headhunter_view?select=s:potential_score`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
        "Accept-Profile": "features"
      },
    });

    if (!apiResponse.ok) throw new Error(`HTTP ${apiResponse.status}`);

    // [GUARD] VALIDATION BOUNDARY (Target C [1]).
    // [THREAT:] External API data is un-trusted. Replacing unsafe 'as' with strict validation.
    const rawRecruitsPayload: unknown = await apiResponse.json();
    const recruitValidation = v.safeParse(SwSupabaseResponseSchema, rawRecruitsPayload);

    if (!recruitValidation.success) {
      console.error("[SW] Background sync: Malformed API response", recruitValidation.issues);
      return;
    }

    const recruitSnapshots = recruitValidation.output;
    const highPotentialCount = recruitSnapshots.filter((recruitSnapshot) => recruitSnapshot.s >= scoreThreshold).length;

    if (highPotentialCount > 0) {
      if (self.navigator.setAppBadge) {
        await self.navigator.setAppBadge(highPotentialCount);
      }

      const notificationMetadata = {
        type: "badge",
        count: highPotentialCount,
        shortcutId: NOTIFICATION_SHORTCUT_ID,
        url: "/#/headhunter",
        timestamp: Date.now(),
      };

      await self.registration.showNotification("New Recruits Available", {
        body: `You have ${highPotentialCount} recruit${highPotentialCount === 1 ? "" : "s"} above your threshold.`,
        icon: "assets/icons/icon-192.png",
        badge: "assets/icons/icon-64.png",
        tag: NOTIFICATION_TAG_RECRUIT,
        renotify: false,
        silent: false,
        requireInteraction: false,
        data: notificationMetadata,
      } as NotificationOptions);
    } else {
      const activeNotifications = await self.registration.getNotifications({
        tag: NOTIFICATION_TAG_RECRUIT,
      });
      activeNotifications.forEach((notification) => notification.close());
      if (self.navigator.clearAppBadge)
        await self.navigator.clearAppBadge();
    }
  } catch (backgroundSyncError: unknown) {
    console.error("[SW] Background sync failed", backgroundSyncError);
  }
}
