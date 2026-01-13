import { ref, readonly } from "vue";

/**
 * 💡 USE WAKE LOCK
 * Prevents device sleep during heavy tasks (Batch Blitz, Sync).
 * Stability #15: Re-acquires lock automatically on visibility change.
 */

// Native API Types (Global/Polyfilled if needed)
interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  readonly type: "screen";
  release(): Promise<void>;
  onrelease: ((this: WakeLockSentinel, ev: Event) => any) | null;
}

interface WakeLock {
  request(type: "screen"): Promise<WakeLockSentinel>;
}

const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
const isActive = ref(false);
// Track user intent to persist lock across visibility changes. Default to FALSE.
let shouldBeActive = false;
let wakeLockSentinel: WakeLockSentinel | null = null;

async function request() {
  if (!isSupported) return;
  try {
    wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
    if (!wakeLockSentinel) return;

    isActive.value = true;
    shouldBeActive = true;

    wakeLockSentinel.addEventListener("release", () => {
      // If released by system (tab hidden, low battery), isActive becomes false visually.
      // We rely on visibilitychange listener to re-acquire if shouldBeActive is true.
      if (wakeLockSentinel !== null) {
        isActive.value = false;
        wakeLockSentinel = null;
      }
    });
  } catch (err) {
    console.warn(`WakeLock request failed: ${(err as Error).message}`);
    isActive.value = false;
  }
}

async function release() {
  shouldBeActive = false; // User explicitly turned it off
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

