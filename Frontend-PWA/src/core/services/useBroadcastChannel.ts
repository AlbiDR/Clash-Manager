import { onUnmounted } from "vue";

/**
 * 📡 BROADCAST CHANNEL API
 * Enables cross-tab communication to keep state synchronized.
 */

// Define typed messages for our app
export type BroadcastMessage =
  | { type: "BADGE_UPDATE"; count: number }
  | { type: "DATA_SYNC_SUCCESS"; timestamp: number }
  | { type: "RECRUIT_DISMISSAL"; ids: string[] }
  | { type: "FORCE_REFRESH" };

const CHANNEL_NAME = "clash_manager_broadcast";

export function useBroadcastChannel(
  onMessage?: (msg: BroadcastMessage) => void,
) {
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }

  function post(msg: BroadcastMessage) {
    if (channel) {
      channel.postMessage(msg);
    }
  }

  function handleMessage(event: MessageEvent) {
    if (onMessage && event.data) {
      onMessage(event.data);
    }
  }

  if (channel && onMessage) {
    channel.addEventListener("message", handleMessage);
  }

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
