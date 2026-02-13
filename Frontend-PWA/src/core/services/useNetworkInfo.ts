import { ref, readonly, onMounted, onUnmounted, computed } from "vue";

/**
 * 📡 NETWORK INFORMATION API
 * Provides detailed network status beyond simple online/offline.
 */

// Type definitions for Network Information API
interface NetworkInformation extends EventTarget {
  readonly type?:
    | "bluetooth"
    | "cellular"
    | "ethernet"
    | "none"
    | "wifi"
    | "wimax"
    | "other"
    | "unknown";
  readonly effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  readonly downlinkMax?: number;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  onchange?: EventListener;
}

// Global Navigator augmentation
declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

// Global state to share across components
const effectiveType = ref<string>("4g"); // optimistically default to 4g
const downlink = ref<number>(10); // optimistically default to fast
const saveData = ref<boolean>(false);
const rtt = ref<number>(0);

let isInitialized = false;

export function useNetworkInfo() {
  const connection =
    typeof navigator !== "undefined"
      ? navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection
      : null;

  function updateConnectionStatus() {
    if (connection) {
      effectiveType.value = connection.effectiveType || "4g";
      downlink.value = connection.downlink || 10;
      saveData.value = connection.saveData || false;
      rtt.value = connection.rtt || 0;
    }
  }

  // Calculate if connection is considered "slow"
  // Slow is defined as: explicit slow-2g/2g OR high latency (>500ms) OR low bandwidth (<1Mbps)
  const isSlowConnection = computed(() => {
    return (
      effectiveType.value === "slow-2g" ||
      effectiveType.value === "2g" ||
      rtt.value > 500 ||
      downlink.value < 1
    );
  });

  if (!isInitialized && connection && typeof window !== "undefined") {
    updateConnectionStatus();
    connection.addEventListener("change", updateConnectionStatus);
    isInitialized = true;
  }

  return {
    isSupported: !!connection,
    effectiveType: readonly(effectiveType),
    downlink: readonly(downlink),
    saveData: readonly(saveData),
    rtt: readonly(rtt),
    isSlowConnection,
  };
}
