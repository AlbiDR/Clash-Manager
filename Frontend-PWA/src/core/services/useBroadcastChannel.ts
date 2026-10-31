// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { getCurrentInstance, onUnmounted } from "vue";

/**
 * Interface contract for cross-tab communication via the Broadcast Channel API.
 *
 * Defines the schema for messages that ensure state eventual consistency
 * across multiple open browser instances of the application.
 */
export type BroadcastMessage =
  | {
      /** Informs other tabs of an updated unread or pending badge count. */
      type: "BADGE_UPDATE";
      /** The latest numerical badge count to synchronize. */
      count: number;
    }
  | {
      /** Notifies other tabs that a full database sync completed successfully. */
      type: "DATA_SYNC_SUCCESS";
      /** Unix timestamp in milliseconds indicating when the sync occurred. */
      timestamp: number;
    }
  | {
      /** Broadcasts the soft dismissal of recruits to suppress them in other tabs. */
      type: "RECRUIT_DISMISSAL";
      /** Unique player tags corresponding to the dismissed candidates. */
      ids: string[];
    }
  | {
      /** Broadcasts the restoration of previously dismissed recruits. */
      type: "RECRUIT_RESTORATION";
      /** Unique player tags corresponding to the restored candidates. */
      ids: string[];
    }
  | {
      /** Instructs all peer tabs to discard cached state and refresh from origin. */
      type: "FORCE_REFRESH";
    };

/**
 * The unique identifier for the application-wide communication channel.
 *
 * @remarks
 * [DECISION LOG] Channel Isolation: A static string identifier bounds
 * message routing strictly to instances of the Clash Manager application
 * executing under the same origin.
 */
const CHANNEL_NAME = "clash_manager_broadcast";

/**
 * COMPOSABLE: useBroadcastChannel
 *
 * @remarks
 * A Layer 1 (@core) hardware broker for the W3C Broadcast Channel API.
 *
 * Satisfies CleanStack Architecture ADR Section I (Core Services) and
 * ADR Section III: Data Flow & Transactional Integrity.
 *
 * This service enables frictionless, low-latency communication between different
 * browser tabs or windows belonging to the same origin. It is used to maintain
 * UI synchronization for global state (badges, sync timestamps, dismissals) without
 * requiring expensive polling or server-side pushes for local events.
 *
 * **Architectural Context:**
 * - Layer: Layer 1 (@core)
 * - Import Boundaries: This module is a terminal leaf hardware broker.
 *   May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 *
 * @sideeffects
 * - Instantiates a native browser `BroadcastChannel` instance if supported.
 * - Attaches and removes `message` event listeners on the underlying channel.
 * - Dispatches cross-tab message events through the native channel.
 * - Binds component unmount lifecycle hooks via `onUnmounted` when called in a Vue component context.
 *
 * @param onMessage - Optional callback triggered when a message is received from another tab.
 *
 * @returns An object containing:
 * - `isSupported`: Boolean indicating if the Broadcast Channel API is available in the runtime environment.
 * - `post`: Function to broadcast a typed `BroadcastMessage` payload to all other active tabs.
 */
export function useBroadcastChannel(
  onMessage?: (incomingMessage: BroadcastMessage) => void,
) {
  let channel: BroadcastChannel | null = null;

  // [DECISION LOG] API Availability Guard: Ensure the BroadcastChannel API exists
  // before instantiation to prevent runtime reference errors in SSR or restricted runtimes.
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }

  /**
   * Dispatches a message to all other active tabs.
   *
   * @param outgoingMessage - The typed message payload to broadcast.
   *
   * @remarks
   * Messages are dispatched synchronously across the browser process boundary
   * to all active tabs listening on the matching channel name.
   */
  function post(outgoingMessage: BroadcastMessage) {
    if (channel) {
      channel.postMessage(outgoingMessage);
    }
  }

  /**
   * Internal bridge to route native MessageEvents to the provided handler.
   *
   * @param event - The native MessageEvent dispatched by the browser's BroadcastChannel.
   *
   * @remarks
   * [DECISION LOG] Message Unpacking: Extracts `event.data` and forwards only
   * non-null payloads to the consumer callback.
   */
  function handleMessage(event: MessageEvent) {
    if (onMessage && event.data) {
      onMessage(event.data);
    }
  }

  // [DECISION LOG] Listener Attachment: Only bind event listener if a handler callback
  // is provided to minimize runtime event-dispatch overhead.
  if (channel && onMessage) {
    channel.addEventListener("message", handleMessage);
  }

  /**
   * LIFECYCLE CLEANUP
   *
   * @remarks
   * [THREAT:] Memory Leak. Orphaned event listeners and open communication channels
   * can prevent garbage collection and lead to performance degradation over time.
   * [DECISION LOG] Explicit Cleanup: Closing the channel and removing listeners
   * ensures the browser can efficiently garbage collect the execution context
   * when the component unmounts.
   *
   * [GUARD] Logic: Safe lifecycle management.
   * [DECISION LOG] Instance Check: Composables used in Pinia or services may not
   * have a component instance. We only attach the `onUnmounted` hook if an
   * active component instance is detected to prevent Vue runtime warnings.
   */
  const componentInstance = getCurrentInstance();
  if (componentInstance) {
    onUnmounted(() => {
      if (channel) {
        if (onMessage) channel.removeEventListener("message", handleMessage);
        channel.close();
      }
    });
  }

  return {
    /** Boolean indicating if the Broadcast Channel API is available in the runtime. */
    isSupported: !!channel,
    /** Function to broadcast a message to all other active tabs. */
    post,
  };
}
