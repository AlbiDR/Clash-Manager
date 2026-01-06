// @ts-nocheck
import { ref, onMounted } from "vue";

export function useNotificationPermission() {
  const permission = ref<NotificationPermission>("default");
  const isSupported = typeof Notification !== "undefined";

  onMounted(() => {
    if (isSupported) {
      permission.value = Notification.permission;
    }
  });

  async function requestPermission(): Promise<boolean> {
    if (!isSupported) {
      console.warn("[Notifications] Not supported in this browser");
      return false;
    }

    if (permission.value === "granted") {
      console.log("[Notifications] Permission already granted");
      return true;
    }

    try {
      const result = await Notification.requestPermission();
      permission.value = result;

      if (result === "granted") {
        console.log(
          "[Notifications] Permission granted! Badge API should now work reliably.",
        );
        return true;
      } else if (result === "denied") {
        console.warn("[Notifications] Permission denied by user");
        return false;
      } else {
        console.log("[Notifications] Permission dismissed");
        return false;
      }
    } catch (error) {
      console.error("[Notifications] Failed to request permission:", error);
      return false;
    }
  }

  function getStatusLabel(): string {
    switch (permission.value) {
      case "granted":
        return "Enabled";
      case "denied":
        return "Blocked";
      default:
        return "Not Set";
    }
  }

  function getStatusColor(): string {
    switch (permission.value) {
      case "granted":
        return "success";
      case "denied":
        return "error";
      default:
        return "warning";
    }
  }

  return {
    permission,
    isSupported,
    requestPermission,
    getStatusLabel,
    getStatusColor,
  };
}
