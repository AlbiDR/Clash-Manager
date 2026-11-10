// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, readonly, computed, type DeepReadonly, type Ref, type ComputedRef } from "vue";

/**
 * [NETWORK] NETWORK INFORMATION API
 * Provides detailed network status beyond simple online/offline.
 */

/**
 * Type definitions for the W3C Network Information API specification.
 * Captures connection medium, bandwidth metrics, round-trip times, and data-saver preferences.
 */
interface NetworkInformation extends EventTarget {
  /** Underlying connection medium type. */
  readonly type?:
    | "bluetooth"
    | "cellular"
    | "ethernet"
    | "none"
    | "wifi"
    | "wimax"
    | "other"
    | "unknown";
  /** Effective connection type determined by round-trip time and downlink bandwidth. */
  readonly effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  /** Upper bound on downlink speed for the current network medium in Mbps. */
  readonly downlinkMax?: number;
  /** Effective bandwidth estimate in megabits per second (Mbps). */
  readonly downlink?: number;
  /** Estimated round-trip time (RTT) in milliseconds, rounded to nearest 25ms. */
  readonly rtt?: number;
  /** Boolean indicating whether the user has requested a reduced-data usage mode. */
  readonly saveData?: boolean;
  /** Event listener triggered whenever connection metrics or network interface changes. */
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

/**
 * [DECISION LOG] Module-level reactive singleton state:
 * Sharing reactive refs at the module scope ensures that telemetry is synchronized
 * across all composable call sites and avoids redundant hardware event listeners.
 *
 * Optimistic defaults are selected to avoid premature degradation gating during
 * cold boot or server-side hydration.
 */
// EPHEMERAL: intentionally resets on cold start
const effectiveType = ref<string>("4g"); // optimistically default to 4g
const downlink = ref<number>(10); // optimistically default to fast
const saveData = ref<boolean>(false);
const rtt = ref<number>(0);

/** Guard flag to ensure single, idempotent listener attachment to the hardware API. */
let isInitialized = false;

/**
 * Authoritative return contract for `useNetworkInfo`.
 *
 * @remarks
 * Encapsulates read-only reactive primitives and computed degradation indicators
 * providing full type safety across Layer 1 consumers.
 */
export interface UseNetworkInfoReturn {
  /** Boolean indicating if the Network Information API is supported by the current client. */
  isSupported: boolean;
  /** Reactive read-only reference to effective network type ('slow-2g', '2g', '3g', or '4g'). */
  effectiveType: DeepReadonly<Ref<string>>;
  /** Reactive read-only reference to estimated downlink bandwidth in Mbps. */
  downlink: DeepReadonly<Ref<number>>;
  /** Reactive read-only reference to user Data Saver preference flag. */
  saveData: DeepReadonly<Ref<boolean>>;
  /** Reactive read-only reference to estimated round-trip time in milliseconds. */
  rtt: DeepReadonly<Ref<number>>;
  /** Computed reactive boolean indicating degraded connection (high latency or low bandwidth). */
  isSlowConnection: ComputedRef<boolean>;
}

/**
 * COMPOSABLE: useNetworkInfo
 *
 * @remarks
 * Brokered access to the device Network Information API. This service acts as a
 * Layer 1 (@core) hardware broker, providing reactive insights into connection
 * quality (latency, bandwidth, and effective type) beyond simple online/offline status.
 *
 * Satisfies CleanStack Architecture ADR Section I: Core Services Foundation and
 * ADR Section IV: Resilience & Connectivity (Hardware Brokering).
 *
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services)
 * - **Responsibility:** Brokered telemetry and degradation detection for the client connection.
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * **Side Effects:**
 * - Attaches a persistent 'change' event listener to `navigator.connection` on supported platforms.
 *
 * @returns Object adhering to `UseNetworkInfoReturn`.
 */
export function useNetworkInfo(): UseNetworkInfoReturn {
  // [THREAT:] Undefined Navigator Environment.
  // [DECISION LOG] Defensive access ensures safe fallback in non-browser, SSR, or web-worker contexts.
  const networkConnection =
    typeof navigator !== "undefined"
      ? navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection
      : null;

  /**
   * Synchronizes module-level reactive state with current hardware connection metrics.
   */
  function updateConnectionStatus() {
    if (networkConnection) {
      effectiveType.value = networkConnection.effectiveType || "4g";
      downlink.value = networkConnection.downlink || 10;
      saveData.value = networkConnection.saveData || false;
      rtt.value = networkConnection.rtt || 0;
    }
  }

  // Calculate if connection is considered "slow"
  // Slow is defined as: explicit slow-2g/2g OR high latency (>500ms) OR low bandwidth (<1Mbps)
  const isSlowConnection = computed(() => {
    return (
      // [THREAT:] Mobile Network Latency Spikes. Slow cellular handshakes severely degrade UX.
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

  // [THREAT:] Listener Duplication & Memory Leaks.
  // [DECISION LOG] Idempotent initialization ensures exactly one event listener is attached
  // across all composable instances during the application lifecycle.
  if (!isInitialized && networkConnection && typeof window !== "undefined") {
    updateConnectionStatus();
    networkConnection.addEventListener("change", updateConnectionStatus);
    isInitialized = true;
  }

  return {
    isSupported: !!networkConnection,
    effectiveType: readonly(effectiveType),
    downlink: readonly(downlink),
    saveData: readonly(saveData),
    rtt: readonly(rtt),
    isSlowConnection,
  };
}
