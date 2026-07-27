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
  | { type: "BADGE_UPDATE"; count: number }
  | { type: "DATA_SYNC_SUCCESS"; timestamp: number }
  | { type: "RECRUIT_DISMISSAL"; ids: string[] }
  | { type: "RECRUIT_RESTORATION"; ids: string[] }
  | { type: "FORCE_REFRESH" };

/**
 * The unique identifier for the application-wide communication channel.
 */
const CHANNEL_NAME = "clash_manager_broadcast";

/**
 * COMPOSABLE: useBroadcastChannel
 *
 * @remarks
 * A Layer 1 (@core) hardware broker for the W3C Broadcast Channel API.
 *
 * This service enables frictionless, low-latency communication between different
 * browser tabs or windows belonging to the same origin. It is used to maintain
 * UI synchronization for global state (badges, sync timestamps, dismissals) without
 * requiring expensive polling or server-side pushes for local events.
 *
 * It is strictly forbidden from importing from Features (@features) or App (@app)
 * layers to maintain architectural purity.
 *
 * @param onMessage - Optional callback triggered when a message is received from another tab.
 *
 * @returns
 * - `isSupported`: Boolean indicating if the Broadcast Channel API is available in the runtime.
 * - `post`: Function to broadcast a message to all other active tabs.
 */
export function useBroadcastChannel(
  onMessage?: (incomingMessage: BroadcastMessage) => void,
) {
  let channel: BroadcastChannel | null = null;

  // Defensive Check: Ensure the API exists before instantiation to prevent runtime crashes.
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }

  /**
   * Dispatches a message to all other active tabs.
   *
   * @param outgoingMessage - The typed message payload to broadcast.
   */
  function post(outgoingMessage: BroadcastMessage) {
    if (channel) {
      channel.postMessage(outgoingMessage);
    }
  }

  /**
   * Internal bridge to route native MessageEvents to the provided handler.
   */
  function handleMessage(event: MessageEvent) {
    if (onMessage && event.data) {
      onMessage(event.data);
    }
  }

  // Listener Attachment: Only bind if a handler is provided to minimize overhead.
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
