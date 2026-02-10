import { useNetworkInfo , ConsoleLayout, ConsoleHeader, FloatingDock, HeaderInfoOverlay } from "@shared";
import { useApiState } from "@core";
import { ref, computed, readonly, watch } from "vue";
export type ConnectionStatus =
  | "online"
  | "offline"
  | "syncing"
  | "success-resolve"
  | "slow";

const isOnline = ref(navigator.onLine);
const isSuccessFading = ref(false);
const isSyncing = ref(false);

// Module-level event listener initialization
let listenersAttached = false;

function handleOnline() {
  isOnline.value = true;
}

function handleOffline() {
  // Direct offline detection is usually reliable for "hard" disconnects
  isOnline.value = false;
}

// Attach listeners once at module level
if (!listenersAttached && typeof window !== "undefined") {
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
  const { isSlowConnection, effectiveType } = useNetworkInfo();

  function setSyncing(val: boolean) {
    isSyncing.value = val;
  }

  function setSuccess() {
    isSuccessFading.value = true;
    setTimeout(() => {
      isSuccessFading.value = false;
    }, 1800);
  }

  // Priority Queue Logic for Status
  // 1. Hard Offline (Physical)
  // 2. Soft Offline (API Failure)
  // 3. Success Animation (High Priority Visual Feedback)
  // 4. Syncing (Active Operation)
  // 5. Slow Connection (Warning)
  // 6. Online (Idle/Safe)
  const status = computed((): ConnectionStatus => {
    // 1. Physical Offline
    if (!isOnline.value) return "offline";

    // 2. API Offline
    if (apiStatus.value === "offline" || apiStatus.value === "unconfigured") return "offline";

    // 3. Success State (Visual Priority)
    if (isSuccessFading.value) return "success-resolve";

    // 4. Checking / Waking / Stale / Active Syncing
    // We treat all "in-progress" or "recovering" states as syncing
    if (
      isSyncing.value || 
      apiStatus.value === "checking" || 
      apiStatus.value === "waking" || 
      apiStatus.value === "stale"
    ) {
      return "syncing";
    }

    // 5. Slow Network
    if (isSlowConnection.value) return "slow";

    // 6. Default Online (Only if strictly online)
    if (apiStatus.value === "online") return "online";

    return "syncing"; // Default to syncing if we're in an unknown intermediate state
  });

  return {
    status,
    isOnline: readonly(isOnline),
    isSlow: isSlowConnection,
    type: effectiveType,
    setSyncing,
    setSuccess,
  };
}

// Test Helper
export function resetConnectionState() {
  if (import.meta.env.TEST) {
    // We need to access the variables.
    // Since they are not exported, we can't easily reset them from outside unless this function is inside the module scope.
    // Ideally this function sets the non-exported refs.
    // Note: isOnline, isSyncing, etc are module-level variables.
    // However, they are const refs?
    // const isOnline = ref(...) -> reactive object. We can change .value.

    // Check if variables are accessible here.
    // They are defined at module level (lines 12-14).
    // So this works.
    isSuccessFading.value = false;
    isSyncing.value = false;
    // reset online status to default (true)
    isOnline.value = true;
  }
}
