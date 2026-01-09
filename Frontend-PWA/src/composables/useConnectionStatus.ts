import { ref, computed, readonly, onMounted, onUnmounted } from "vue";
import { useApiState } from "./useApiState";
import { useClanData } from "./useClanData"; // Fix 20

export type ConnectionStatus = "online" | "offline" | "syncing" | "success-resolve";

const isOnline = ref(navigator.onLine);
const isSuccessFading = ref(false);
const isSyncing = ref(false);

// Fix 19: Debounce Offline
let offlineTimeout: any = null;

/**
 * 🌐 USE CONNECTION STATUS
 * Unifies physical network status (navigator.onLine) and logical API status.
 * Provides a single source of truth for all connectivity-related UI.
 */
export function useConnectionStatus() {
  const { apiStatus } = useApiState();
  const { refresh } = useClanData(); // Fix 20

  function handleOnline() {
    if (offlineTimeout) clearTimeout(offlineTimeout);
    isOnline.value = true;
    // Fix 20: Reconnection Trigger
    refresh();
  }
  
  function handleOffline() { 
    // Fix 19: Debounce (2s buffer before showing offline UI)
    offlineTimeout = setTimeout(() => {
       isOnline.value = false;
    }, 2000);
  }

  onMounted(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  });

  onUnmounted(() => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  });

  function setSyncing(val: boolean) {
    isSyncing.value = val;
  }

  function setSuccess() {
    isSuccessFading.value = true;
    setTimeout(() => {
      isSuccessFading.value = false;
    }, 1800);
  }

  const status = computed((): ConnectionStatus => {
    if (!isOnline.value || apiStatus.value === "offline") return "offline";
    if (isSuccessFading.value) return "success-resolve";
    if (isSyncing.value || apiStatus.value === "checking") return "syncing";
    return "online";
  });

  return {
    status,
    isOnline: readonly(isOnline),
    setSyncing,
    setSuccess,
  };
}
