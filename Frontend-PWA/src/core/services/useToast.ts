import { useHaptics } from "./useHaptics";
import { ref } from "vue";
export interface ToastOptions {
  id: string;
  type: "success" | "error" | "info" | "undo";
  message: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
  timer?: any; // Internal use for cleanup
}

const toasts = ref<ToastOptions[]>([]);
const processingIds = new Set<string>();

/**
 * 🔔 USE TOAST
 * Resilient notification system with adaptive duration and haptic feedback.
 */
export function useToast() {
  const haptics = useHaptics();

  function add(options: Omit<ToastOptions, "id">) {
    // ⚡ OPTIMIZATION: Use crypto-secure IDs (Optimization #42)
    const id = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Date.now().toString() + Math.random().toString(36).substring(2, 9);

    const originalAction = options.onAction;
    let actionExecuted = false;

    const safeAction = originalAction
      ? () => {
          if (actionExecuted) return;
          actionExecuted = true;
          originalAction();
        }
      : undefined;

    const toast: ToastOptions = {
      id,
      duration: 5000,
      ...options,
      onAction: safeAction,
    };

    toasts.value.push(toast);

    // 🛡️ Logic: Semantic Haptics
    if (options.type === "error") haptics.error();
    else if (options.type === "success") haptics.success();
    else haptics.tap();

    // 🛡️ Logic: Memory-safe auto-dismiss (Memory #9)
    if (toast.duration !== 0) {
      toast.timer = setTimeout(() => {
        remove(id);
      }, toast.duration);
    }

    return id;
  }

  function remove(id: string) {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const toast = toasts.value[idx];
      if (toast && toast.timer) clearTimeout(toast.timer);
      toasts.value.splice(idx, 1);
    }
  }

  function triggerAction(id: string) {
    if (processingIds.has(id)) return;

    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      processingIds.add(id);
      const toast = toasts.value[idx];

      // Stop dismissal timer
      if (toast && toast.timer) clearTimeout(toast.timer);
      
      // Remove from UI
      toasts.value.splice(idx, 1);

      if (toast && toast.onAction) {
        toast.onAction();
      }


      // Lock to prevent multi-fire in rapid succession
      setTimeout(() => {
        processingIds.delete(id);
      }, 800);
    }
  }

  return {
    toasts,
    add,
    remove,
    triggerAction,
    success: (message: string) => add({ type: "success", message }),
    error: (message: string) => add({ type: "error", message, duration: 8000 }),
    info: (message: string) => add({ type: "info", message }),
    undo: (message: string, action: () => void) => add({
      type: "undo",
      message,
      actionLabel: "UNDO",
      onAction: action,
      duration: 7000,
    }),
  };
}

