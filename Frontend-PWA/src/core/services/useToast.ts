// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useHaptics } from "./useHaptics";
import { ref } from "vue";

/**
 * Interface representing a single toast notification.
 */
export interface ToastOptions {
  /** Unique identifier for the toast. */
  id: string;
  /** The semantic type of the toast, determining its visual style and haptic feedback. */
  type: "success" | "error" | "info" | "undo";
  /** The message text to display. */
  message: string;
  /** Visibility duration in milliseconds. Set to 0 for persistent toasts. Defaults to 5000. */
  duration?: number;
  /** Optional label for an action button (e.g., "UNDO"). */
  actionLabel?: string;
  /** Callback function executed when the action button is clicked. */
  onAction?: () => void;
  /** @internal Internal timer ID used for auto-dismissal cleanup. */
  timer?: ReturnType<typeof setTimeout>;
}

/** Global reactive state for active toasts. */
const toasts = ref<ToastOptions[]>([]);

/**
 * Set of IDs currently being processed for an action.
 * Prevents race conditions and multi-firing during rapid user interaction.
 */
const processingIds = new Set<string>();

/**
 * COMPOSABLE: useToast
 *
 * @remarks
 * Provides a resilient, global notification system with support for adaptive
 * durations and semantic haptic feedback.
 *
 * [ARCHITECTURE] ADR LAYER: @core (Layer 1)
 * - Permitted Imports: Other @core services (e.g., useHaptics), Vue reactivity.
 * - Forbidden Imports: Any component or service from @shared or @features.
 *
 * @returns
 * - `toasts`: Reactive array of active toast notifications.
 * - `add`: Base method to create a new toast.
 * - `remove`: Manually dismiss a toast by ID.
 * - `triggerAction`: Executes the action callback for a specific toast.
 * - `success/error/info/undo`: Semantic shorthand methods.
 *
 * @sideeffects
 * - TRIGGERS device haptics via `useHaptics`.
 * - SCHEDULES `setTimeout` for automatic dismissal.
 * - MUTATES the global `toasts` reactive state.
 */
export function useToast() {
  const haptics = useHaptics();

  /**
   * Internal helper to create and track a new toast notification.
   *
   * @param options - Toast configuration without the ID.
   * @returns The generated UUID or timestamp-based ID for the toast.
   */
  function add(options: Omit<ToastOptions, "id">) {
    // ⚡ OPTIMIZATION: Use crypto-secure IDs (Optimization #42)
    // Rationale: Ensures uniqueness across the application lifecycle.
    const id = typeof crypto !== "undefined" && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Date.now().toString() + Math.random().toString(36).substring(2, 9);

    const originalAction = options.onAction;
    let actionExecuted = false;

    // Wrap action to ensure it only fires once.
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
    // Rationale: Provides physical confirmation aligned with the notification type.
    if (options.type === "error") haptics.error();
    else if (options.type === "success") haptics.success();
    else haptics.tap();

    // 🛡️ Logic: Memory-safe auto-dismiss (Memory #9)
    // Rationale: Automatically cleans up DOM elements and timer references.
    if (toast.duration !== 0) {
      toast.timer = setTimeout(() => {
        remove(id);
      }, toast.duration);
    }

    return id;
  }

  /**
   * Dismisses a toast and clears its associated timer.
   *
   * @param id - The ID of the toast to remove.
   */
  function remove(id: string) {
    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const toast = toasts.value[idx];
      if (toast && toast.timer) clearTimeout(toast.timer);
      toasts.value.splice(idx, 1);
    }
  }

  /**
   * Executes a toast's action and removes it from the queue.
   *
   * @remarks
   * Implements a 800ms lock (debounce) to prevent accidental double-taps
   * on high-consequence actions like "UNDO".
   *
   * @param id - The ID of the toast whose action should be triggered.
   */
  function triggerAction(id: string) {
    if (processingIds.has(id)) return;

    const idx = toasts.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      processingIds.add(id);
      const toast = toasts.value[idx];

      // Stop dismissal timer immediately when user interacts.
      if (toast && toast.timer) clearTimeout(toast.timer);
      
      // Remove from UI before executing logic for better perceived performance.
      toasts.value.splice(idx, 1);

      if (toast && toast.onAction) {
        toast.onAction();
      }

      // Lock to prevent multi-fire in rapid succession (Bug #22)
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
