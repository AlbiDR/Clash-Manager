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
 * COMPOSABLE: useBadge
 *
 * @remarks
 * Orchestrates cross-platform application badge management.
 *
 * This service implements a dual-path strategy:
 * 1. Standard Path: Uses the W3C Badge API (setAppBadge) for supported platforms (iOS, Windows).
 * 2. Android Path: Implements a workaround using persistent notifications via the Service Worker,
 *    as Android does not natively support the Badge API outside of notification contexts.
 *
 * It ensures consistency across multiple tabs via the Broadcast Channel and implements
 * defensive performance measures (debouncing) and reliability patterns (retries).
 *
 * @returns
 * - `isSupported`: Reactive boolean indicating if any form of badging is supported.
 * - `setBadge`: Function to update the badge count.
 * - `clearBadge`: Function to remove the badge.
 * - `sendLocalNotification`: Function to trigger a browser notification.
 * - `requestPermission`: Function to prompt the user for notification permissions.
 *
 * @sideeffects
 * - WRITES to the standard `Badge API` (setAppBadge/clearAppBadge).
 * - COMMUNICATES with the `Service Worker` via `postMessage` for notification-based badges.
 * - BROADCASTS updates to other tabs via `BroadcastChannel`.
 * - READS and REACTS to global `useAppSettings` (Quiet Mode, Sound, Threshold).
 */
export function useBadge() {
  const { modules } = useAppSettings();

  // Broadcast Channel Integration
  const { post: broadcast } = useBroadcastChannel((msg) => {
    if (msg.type === "BADGE_UPDATE") {
      // Don't recurse - just set internal state or notify SW if needed
      // For now, we trust the sender also updated the SW/Badge API
    }
  });

  const hasStandardBadge =
    typeof navigator !== "undefined" && "setAppBadge" in navigator;
  const hasServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;

  // Android has setAppBadge but it doesn't work - only notifications create badges
  const isSupported = hasServiceWorker || (!isAndroid && hasStandardBadge);

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
      const nav = navigator as NavigatorWithBadge;
      if (count > 0) await nav.setAppBadge(count);
      else await nav.clearAppBadge();
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
   * Implements a 1500ms debounce to prevent API flooding and excessive
   * Service Worker wake-ups. Includes a retry mechanism for transient failures.
   *
   * @param count - The target badge count.
   */
  async function setBadge(count: number) {
    if (!isSupported) return;

    // DECISION LOG: Quiet Mode integration from useAppSettings.
    if (modules.notificationQuietMode && count > 0) {
      // Suppress badges in quiet mode on Android (since they require notifications).
      if (isAndroid) return;
    }

    // PERFORMANCE: Debounce updates to prevent API flooding (Bug #13).
    // Rationale: Rapid changes in recruit counts could lead to race conditions in the SW
    // and browser-level rate limiting of the Badge API.
    const now = Date.now();
    if (now - lastUpdate.value < 1500) return;
    lastUpdate.value = now;

    const safeCount = Math.max(0, Math.floor(count));

    // RETRY MECHANISM (Bug #7 via Batch 1 refinement).
    // Rationale: Some browsers temporarily block Badge API calls if flooded or during
    // tab/visibility transitions. This exponential backoff ensures eventual consistency.
    let attempts = 0;
    const MAX_RETRIES = 2;

    const trySet = async () => {
      try {
        // ANDROID: Use notification-based badges.
        if (isAndroid) {
          await setBadgeViaNotification(safeCount);
        } else {
          // OTHER PLATFORMS: Use direct Badge API.
          await setDirectBadge(safeCount);
        }
      } catch (e) {
        if (attempts < MAX_RETRIES) {
          attempts++;
          setTimeout(trySet, 800 * attempts);
        } else {
          console.warn("[Badge] Persistent failure", e);
        }
      }
    };

    await trySet();

    // Broadcast to other tabs so they know the badge count changed for UI synchronization.
    broadcast({ type: "BADGE_UPDATE", count: safeCount });
  }

  /**
   * Resets the application badge to 0.
   */
  async function clearBadge() {
    await setBadge(0);
  }

  /**
   * Triggers a local OS notification.
   *
   * @param title - The main heading of the notification.
   * @param body - Secondary descriptive text.
   * @param channelId - Optional identifier for grouping (e.g., 'hh-channel').
   *
   * @sideeffects
   * - COMMUNICATES with the `Service Worker` via `postMessage`.
   * - WRITES to the `Notification API` (indirectly via Service Worker).
   */
  async function sendLocalNotification(
    title: string,
    body?: string,
    channelId?: string,
  ) {
    if (Notification.permission !== "granted") return;

    // Suppression in Quiet Mode.
    if (modules.notificationQuietMode) return;

    // Service Worker Layer.
    if (hasServiceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: {
          body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: "local-alert",
          channelId, // Optional: for Headhunter channel
          silent: !modules.notificationSound, // Respect sound setting
          actions: [{ action: "open", title: "Open" }],
        },
      });
    }
  }

  /**
   * Requests permission to display notifications.
   *
   * @returns A promise resolving to the PermissionStatus.
   */
  async function requestPermission() {
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
