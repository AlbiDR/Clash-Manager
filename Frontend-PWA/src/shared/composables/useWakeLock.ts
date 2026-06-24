// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly } from "vue";

/**
 * [TIP] USE WAKE LOCK
 * Prevents device sleep during heavy tasks (Batch Blitz, Sync).
 * Stability #15: Re-acquires lock automatically on visibility change.
 */

// Native API Types (Global/Polyfilled if needed)
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: "screen";
  release(): Promise<void>;
  onrelease: ((this: WakeLockSentinel, ev: Event) => void) | null;
}

interface WakeLock {
  request(type: "screen"): Promise<WakeLockSentinel>;
}

interface NavigatorWithWakeLock extends Navigator {
  readonly wakeLock: WakeLock;
}

// [THREAT:] Browser support for Screen Wake Lock API is non-universal.
// [DECISION LOG] Explicitly checking for 'wakeLock' in navigator to prevent runtime crashes on legacy engines.
const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

// EPHEMERAL: intentionally resets on cold start
const isActive = ref(false);

// EPHEMERAL: intentionally resets on cold start
// Track user intent to persist lock across visibility changes. Default to FALSE.
let shouldBeActive = false;

// EPHEMERAL: intentionally resets on cold start
let wakeLockSentinel: WakeLockSentinel | null = null;

async function request() {
  if (!isSupported) return;
  try {
    // [THREAT:] Unsafe cast to 'any' for navigator bypasses type safety.
    // [DECISION LOG] Using NavigatorWithWakeLock interface to ensure structural integrity of the hardware bridge.
    wakeLockSentinel = await (navigator as NavigatorWithWakeLock).wakeLock.request("screen");
    if (!wakeLockSentinel) return;

    isActive.value = true;
    shouldBeActive = true;

    wakeLockSentinel.addEventListener("release", () => {
      // [THREAT:] System-level releases (tab hidden, low battery) can cause silent desync between UI and hardware.
      // [DECISION LOG] If released by system, isActive becomes false visually.
      // We rely on visibilitychange listener to re-acquire if shouldBeActive is true.
      if (wakeLockSentinel !== null) {
        isActive.value = false;
        wakeLockSentinel = null;
      }
    });
  } catch (wakeLockRequestError: unknown) {
    const errorMessage = wakeLockRequestError instanceof Error ? wakeLockRequestError.message : String(wakeLockRequestError);
    console.warn(`WakeLock request failed: ${errorMessage}`);
    isActive.value = false;
  }
}

async function release() {
  // [LOGIC] INTENT TRACKING
  // Rationale: We distinguish between system-level releases (e.g., low battery)
  // and user-driven releases. Setting shouldBeActive to false prevents
  // the visibilitychange listener from re-acquiring the lock.
  shouldBeActive = false;
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
  isActive.value = false;
}

async function toggle() {
  if (isActive.value) {
    await release();
  } else {
    await request();
  }
}

// Auto-reacquire on visibility change if it should be active
// [LOGIC] VISIBILITY RESILIENCE
// Rationale: The browser automatically releases wake locks when a tab is
// hidden to conserve energy. This listener ensures that if the user
// intended to keep the screen on (e.g., during a long batch process),
// the lock is seamlessly re-acquired upon returning to the foreground.
if (isSupported && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      shouldBeActive &&
      !isActive.value
    ) {
      await request();
    }
  });
}

/**
 * COMPOSABLE: useWakeLock
 *
 * @remarks
 * Brokered access to the Screen Wake Lock API. This service ensures that the
 * device display remains active during resource-intensive background operations
 * like Batch Blitz or large-scale data synchronization.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 (@core)
 * - **Import Boundaries:** Forbidden from importing from @shared, @features, or @app.
 *
 * **Side Effects:**
 * - **Visibility Lifecycle:** Automatically re-acquires the wake lock when the
 *   application returns to the foreground if the user intent (`shouldBeActive`)
 *   is still set to true.
 *
 * @returns
 * - `isSupported`: Boolean indicating if the browser supports the Wake Lock API.
 * - `isActive`: Reactive read-only status of the current wake lock.
 * - `request`: Method to manually request a screen wake lock.
 * - `release`: Method to manually release the wake lock and clear user intent.
 * - `toggle`: Method to flip the wake lock state.
 * - `init`: Lifecycle hook to attempt auto-start based on persisted intent.
 */
export function useWakeLock() {
  function init() {
    // Attempt to auto-start if default is On and supported
    if (isSupported && shouldBeActive && !isActive.value) {
      request();
    }
  }

  return {
    isSupported,
    isActive: readonly(isActive),
    request,
    release,
    toggle,
    init,
  };
}
