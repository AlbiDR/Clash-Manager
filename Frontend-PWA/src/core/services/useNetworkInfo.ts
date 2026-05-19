// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly, onMounted, onUnmounted, computed } from "vue";

/**
 * [NETWORK] NETWORK INFORMATION API
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

/**
 * COMPOSABLE: useNetworkInfo
 *
 * @remarks
 * Brokered access to the device Network Information API. This service acts as a
 * Layer 1 (@core) hardware broker, providing reactive insights into connection
 * quality (latency, bandwidth, and effective type) beyond simple online/offline status.
 *
 * [ARCHITECTURE] Layer 1 @core: This module is a kernel primitive and is forbidden
 * from importing from higher layers (@shared, @features, @app). It may only import
 * from @static/substrate foundations.
 *
 * Implements a singleton state pattern: internal reactive refs are maintained at
 * the module level to ensure that all call sites share the same connection
 * metrics and that only a single 'change' listener is attached to the hardware.
 *
 * @returns
 * - `isSupported`: Boolean indicating if the Network Information API is available.
 * - `effectiveType`: Reactive 'slow-2g', '2g', '3g', or '4g' status.
 * - `downlink`: Reactive effective bandwidth estimate in Mbps.
 * - `saveData`: Reactive boolean indicating if the user has enabled Data Saver mode.
 * - `rtt`: Reactive estimated round-trip time in milliseconds.
 * - `isSlowConnection`: Computed boolean for bandwidth/latency-throttled states.
 */
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
      // [RATIONALE] >500ms RTT is the threshold where UI responsiveness significantly degrades
      // for real-time state synchronization and asset fetching.
      rtt.value > 500 ||
      // [RATIONALE] <1Mbps is insufficient for stable parallel asset hydration
      // without triggering significant contention on the main thread.
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
