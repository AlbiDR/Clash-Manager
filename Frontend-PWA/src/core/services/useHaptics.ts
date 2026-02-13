import { ref, onMounted } from "vue";

/**
 * ⚡ ADAPTIVE HAPTICS ENGINE
 * Optimization #48: Adjusts feedback intensity based on battery status and power mode.
 * Optimization #49: Specialized patterns for high-value recruits.
 */
export function useHaptics() {
  const isSupported =
    typeof navigator !== "undefined" && "vibrate" in navigator;
  const isLowPowerMode = ref(false);
  let hasInteracted = false;

  // Initialize Battery Awareness if available
  interface BatteryManager extends EventTarget {
    charging: boolean;
    level: number;
    saveData?: boolean;
    addEventListener(
      type: "chargingchange" | "levelchange",
      listener: EventListenerOrEventListenerObject,
    ): void;
  }

  if (typeof navigator !== "undefined" && "getBattery" in (navigator as any)) {
    (navigator as Navigator & { getBattery(): Promise<BatteryManager> })
      .getBattery()
      .then((battery) => {
        const update = () => {
          isLowPowerMode.value =
            (battery as any).saveData ||
            (battery.level < 0.2 && !battery.charging);
        };
        battery.addEventListener("levelchange", update);
        battery.addEventListener("chargingchange", update);
        update();
      });
  }

  if (typeof window !== "undefined") {
    const setInteracted = () => {
      hasInteracted = true;
      window.removeEventListener("click", setInteracted);
      window.removeEventListener("touchstart", setInteracted);
      window.removeEventListener("keydown", setInteracted);
    };
    window.addEventListener("click", setInteracted, {
      once: true,
      passive: true,
    });
    window.addEventListener("touchstart", setInteracted, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", setInteracted, {
      once: true,
      passive: true,
    });
  }

  const vibrate = (pattern: number | number[]) => {
    if (!isSupported || !hasInteracted) return;

    // Scale down feedback in low power mode to preserve juice
    if (isLowPowerMode.value) {
      if (Array.isArray(pattern)) {
        pattern = pattern.map((p) => Math.max(0, p - 5));
      } else {
        pattern = Math.max(0, pattern - 5);
      }
    }

    try {
      navigator.vibrate(pattern);
    } catch (e) {
      /* Silent fail for non-Haptic devices */
    }
  };

  return {
    isSupported,
    isLowPowerMode,

    tap: () => vibrate(12),
    medium: () => vibrate(25),
    heavy: () => vibrate(35),
    longPress: () => vibrate(65),

    success: () => vibrate([10, 30, 10]),
    error: () => vibrate([60, 40, 60]),
    warning: () => vibrate([35, 40]),
    sync: () => vibrate([10, 15, 10, 15]),

    // Optimization #49: Special Recruit Patterns
    criticalHit: () => vibrate([20, 100, 20, 100]), // Intense heart-beat
    rareFind: () => vibrate([15, 30, 80]), // Ascending pulse

    custom: (pattern: number | number[]) => vibrate(pattern),
  };
}
