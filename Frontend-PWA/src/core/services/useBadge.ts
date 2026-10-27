// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * BADGE SERVICE (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Provides cross-platform application badge management.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This service orchestrates the display of numeric badges on the application
 * icon. It handles platform differences between iOS/Windows (Badge API)
 * and Android (Notification proxy).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

import { useAppSettings } from "./useAppSettings";
import { useBroadcastChannel } from "./useBroadcastChannel";
import { ref } from "vue";
import { BADGE_UPDATE_DEBOUNCE, BADGE_RETRY_BASE_DELAY } from "@core/config";

/**
 * Global persistent state to track debounce across multiple useBadge() instances.
 * This is kept outside the composable to ensure shared state across component mounts.
 * @internal
 */
const lastUpdate = ref(0);

/**
 * Detects if the current environment is Android.
 * Android does not support the Badge API directly; badges are only displayed
 * when an active notification is present.
 * @internal
 */
const isAndroid =
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

/**
 * Interface contract representing the badge service capabilities and methods.
 */
export interface UseBadgeReturn {
  /** Reactive boolean indicating if badging capability is supported in the host environment. */
  isSupported: boolean;
  /** Sets the application badge to the specified numeric count. */
  setBadge: (count: number) => Promise<void>;
  /** Clears the application badge count. */
  clearBadge: () => Promise<void>;
  /** Dispatches a local system notification via the Service Worker controller. */
  sendLocalNotification: (
    title: string,
    body?: string,
    channelId?: string,
  ) => Promise<void>;
  /** Prompts the user for OS-level notification permissions. */
  requestPermission: () => Promise<NotificationPermission | "denied">;
}

/**
 * COMPOSABLE: useBadge
 *
 * @remarks
 * Orchestrates cross-platform application badge management.
 * Satisfies ADR Section I & II: Cross-Platform Substrate Isolation.
 *
 * This service implements a dual-path strategy:
 * 1. Standard Path: Uses the W3C Badge API (`setAppBadge`) for supported desktop/iOS browsers.
 * 2. Android Path: Implements a workaround using persistent notifications via the Service Worker,
 *    as Android does not natively support the Badge API outside of notification contexts.
 *
 * It ensures consistency across multiple tabs via the Broadcast Channel and implements
 * defensive performance measures (debouncing) and reliability patterns (retries).
 *
 * @returns {@link UseBadgeReturn} Interface methods for badge updates and notification dispatch.
 *
 * @sideeffects
 * - WRITES to the standard `Badge API` (`setAppBadge`/`clearAppBadge`).
 * - COMMUNICATES with the `Service Worker` via `postMessage` for notification-based badges.
 * - BROADCASTS updates to other tabs via `BroadcastChannel`.
 * - READS and REACTS to global `useAppSettings` (Quiet Mode, Sound, Threshold).
 */
export function useBadge(): UseBadgeReturn {
  const { modules } = useAppSettings();

  // Broadcast Channel Integration
  const { post: broadcast } = useBroadcastChannel((msg) => {
    if (msg.type === "BADGE_UPDATE") {
      // DECISION LOG: Prevent message recursion across tabs; sender already synchronized SW and DOM Badge API.
    }
  });

  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;
  // THREAT ANNOTATION: WebView Environment Guard [Uncaught TypeError / Crash]
  // Android WebViews lack Notification API support entirely; invoking getNotifications crashes SW worker contexts.
  const hasNotificationApi = typeof Notification !== "undefined";

  // DECISION LOG: Android WebView setAppBadge is non-functional without active system tray notifications.
  const isSupported = isAndroid
    ? hasServiceWorker && hasNotificationApi
    : hasServiceWorker || hasStandardBadge;

  /**
   * Extended Navigator Interface for Badge API.
   */
  interface NavigatorWithBadge extends Navigator {
    setAppBadge(count: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  }

  /**
   * ANDROID: Set badge via persistent notification.
   * Android does not support the direct Badge API; badges are only generated
   * when an active notification is present in the system tray.
   *
   * @param count - The numeric value to display in the badge.
   */
  async function setBadgeViaNotification(count: number) {
    if (!hasServiceWorker || !navigator.serviceWorker.controller) return;

    navigator.serviceWorker.controller.postMessage({
      type: "BADGE_NOTIFICATION_ANDROID",
      count,
      threshold: modules.notificationThreshold || 75,
    });
  }

  /**
   * NON-ANDROID: Use standard Badge API.
   * Communicates with both the DOM and the Service Worker to ensure
   * the badge state is synchronized even if the tab is closed.
   *
   * @param count - The numeric value to display in the badge.
   */
  async function setDirectBadge(count: number) {
    if (hasStandardBadge) {
      const badgeNavigator = navigator as NavigatorWithBadge;
      if (count > 0) await badgeNavigator.setAppBadge(count);
      else await badgeNavigator.clearAppBadge();
    }

    // Also notify service worker for consistency
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SET_BADGE",
        count,
      });
    }
  }

  /**
   * Main entry point for updating the application badge.
   *
   * @remarks
   * Implements a debounced update sequence to prevent API flooding and excessive
   * Service Worker wake-ups. Includes a retry mechanism for transient failures.
   *
   * @param count - The target numeric badge count to set.
   */
  async function setBadge(count: number): Promise<void> {
    if (!isSupported) return;

    // DECISION LOG: Quiet Mode integration from useAppSettings. Suppress Android notification badges when Quiet Mode is active.
    if (modules.notificationQuietMode && count > 0) {
      if (isAndroid) return;
    }

    // PERFORMANCE: Debounce updates to prevent API flooding.
    // Rationale: Rapid changes in recruit counts could lead to race conditions in the SW and browser rate limiting.
    const now = Date.now();
    if (now - lastUpdate.value < BADGE_UPDATE_DEBOUNCE) return;
    lastUpdate.value = now;

    const safeCount = Math.max(0, Math.floor(count));

    // THREAT ANNOTATION: Transient Visibility State Flakiness [Badge API Rejection]
    // Exponential backoff prevents lost updates when setAppBadge is called during tab switching or backgrounding.
    let attempts = 0;
    const MAX_RETRIES = 2;

    const trySet = async () => {
      try {
        if (isAndroid) {
          await setBadgeViaNotification(safeCount);
        } else {
          await setDirectBadge(safeCount);
        }
      } catch (badgeUpdateError) {
        if (attempts < MAX_RETRIES) {
          attempts++;
          setTimeout(trySet, BADGE_RETRY_BASE_DELAY * attempts);
        } else {
          console.warn("[Badge] Persistent failure", badgeUpdateError);
        }
      }
    };

    await trySet();

    // Broadcast to sibling tabs for cross-context UI synchronization.
    broadcast({ type: "BADGE_UPDATE", count: safeCount });
  }

  /**
   * Resets the application badge count to zero.
   */
  async function clearBadge(): Promise<void> {
    await setBadge(0);
  }

  /**
   * Triggers a local OS notification via the controlling Service Worker.
   *
   * @param title - The main heading of the notification.
   * @param body - Secondary descriptive text body.
   * @param channelId - Optional notification channel identifier for grouping.
   *
   * @sideeffects
   * - COMMUNICATES with the `Service Worker` via `postMessage`.
   * - WRITES to the `Notification API` (indirectly via Service Worker controller).
   */
  async function sendLocalNotification(
    title: string,
    body?: string,
    channelId?: string,
  ): Promise<void> {
    if (!hasNotificationApi || Notification.permission !== "granted") return;

    // DECISION LOG: Suppress local alerts whenQuiet Mode is enabled in user settings.
    if (modules.notificationQuietMode) return;

    // DECISION LOG: Delegate notification construction to Service Worker controller to support background action handlers.
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: "local-alert",
          channelId,
          silent: !modules.notificationSound,
          actions: [{ action: "open", title: "Open" }],
        },
      });
    }
  }

  /**
   * Requests OS-level permission to display system notifications.
   *
   * @returns A promise resolving to the permission state string (`granted`, `denied`, or `default`).
   */
  async function requestPermission(): Promise<
    NotificationPermission | "denied"
  > {
    if (typeof Notification !== "undefined") {
      return await Notification.requestPermission();
    }
    return "denied";
  }

  // Logic: Auto-clear removed to support persistent notifications (#Request-Persistence).
  // Badges will now only clear when data changes (recruits dismissed) or explicitly cleared.

  return {
    isSupported,
    setBadge,
    clearBadge,
    sendLocalNotification,
    requestPermission,
  };
}
