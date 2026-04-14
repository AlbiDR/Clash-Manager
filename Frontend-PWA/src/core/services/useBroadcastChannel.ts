// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { onUnmounted } from "vue";

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
  onMessage?: (msg: BroadcastMessage) => void,
) {
  let channel: BroadcastChannel | null = null;

  // Defensive Check: Ensure the API exists before instantiation to prevent runtime crashes.
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }

  /**
   * Dispatches a message to all other active tabs.
   *
   * @param msg - The typed message payload to broadcast.
   */
  function post(msg: BroadcastMessage) {
    if (channel) {
      channel.postMessage(msg);
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
   * Rationale: Explicitly closing the channel and removing listeners prevents
   * memory leaks and ensures the browser can efficiently garbage collect
   * the execution context when the component unmounts.
   */
  onUnmounted(() => {
    if (channel) {
      if (onMessage) channel.removeEventListener("message", handleMessage);
      channel.close();
    }
  });

  return {
    isSupported: !!channel,
    post,
  };
}
