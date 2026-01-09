import { ref, computed, readonly } from "vue";
import { useApiState } from "./useApiState";

export type ConnectionStatus = "online" | "offline" | "syncing" | "success-resolve";

const isOnline = ref(navigator.onLine);
const isSuccessFading = ref(false);
const isSyncing = ref(false);

// Fix 19: Debounce Offline
let offlineTimeout: any = null;

// Module-level event listener initialization
let listenersAttached = false;

function handleOnline() {
  if (offlineTimeout) clearTimeout(offlineTimeout);
  isOnline.value = true;
}

function handleOffline() { 
  // Fix 19: Debounce (2s buffer before showing offline UI)
  offlineTimeout = setTimeout(() => {
     isOnline.value = false;
  }, 2000);
}

// Attach listeners once at module level
if (!listenersAttached && typeof window !== 'undefined') {
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  listenersAttached = true;
}

/**
 * 🌐 USE CONNECTION STATUS
 * Unifies physical network status (navigator.onLine) and logical API status.
 * Provides a single source of truth for all connectivity-related UI.
 */
export function useConnectionStatus() {
  const { apiStatus } = useApiState();

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
    const result = !isOnline.value || apiStatus.value === "offline" 
      ? "offline"
      : isSuccessFading.value 
      ? "success-resolve"
      : isSyncing.value || apiStatus.value === "checking" 
      ? "syncing"
      : "online";
    
    // Debug: log status changes in development
    if (import.meta.env.DEV) {
      console.log('[ConnectionStatus]', {
        isOnline: isOnline.value,
        apiStatus: apiStatus.value,
        isSyncing: isSyncing.value,
        isSuccessFading: isSuccessFading.value,
        computed: result
      });
    }
    
    return result;
  });

  return {
    status,
    isOnline: readonly(isOnline),
    setSyncing,
    setSuccess,
  };
}
