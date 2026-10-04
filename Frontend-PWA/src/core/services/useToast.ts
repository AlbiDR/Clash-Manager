// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
  /** Visibility duration in milliseconds. Set to 0 for persistent toasts. */
  duration?: number;
  /** Optional label for an action button (e.g., "UNDO"). */
  actionLabel?: string;
  /** Callback function executed when the action button is clicked. */
  onAction?: () => void;
}

/** Standard notification lifetime. */
export const DEFAULT_TOAST_DURATION_MS = 5000;

/** Extended lifetime for messages that may need to be read or copied. */
export const ERROR_TOAST_DURATION_MS = 8000;

/** Lifetime of the reversible action window. */
export const UNDO_TOAST_DURATION_MS = 7000;

/** Brief single-flight guard after a toast action executes. */
const TOAST_ACTION_LOCK_DURATION_MS = 800;

/** Global reactive state for active toasts. */
const toasts = ref<ToastOptions[]>([]);

interface ToastTimerState {
  /** Time still available after the most recent pause. */
  remainingDurationMs: number;
  /** Absolute time at which the armed timer expires. */
  deadlineMs: number | null;
  /** The service-owned timer. Components never receive or replace it. */
  timeout: ReturnType<typeof setTimeout> | null;
}

/** Authoritative lifetime state for transient toasts. */
const toastTimers = new Map<string, ToastTimerState>();

/**
 * Set of IDs currently being processed for an action.
 * Prevents race conditions and multi-firing during rapid user interaction.
 */
// EPHEMERAL: intentionally resets on cold start
// [THREAT:] In-memory toast processing lock set resets on app reload / worker cold start; persistent action locks are not required.
const processingIds = new Set<string>();

/**
 * COMPOSABLE: useToast
 *
 * @remarks
 * Provides a resilient, global notification system with support for adaptive
 * durations and semantic haptic feedback.
 *
 * [ARCHITECTURE] ADR LAYER: @core (Layer 1)
 * - Permitted Imports: Other @core services, Vue reactivity.
 * - Forbidden Imports: Any component or service from @shared or @features.
 *
 * @returns
 * - `toasts`: Reactive array of active toast notifications.
 * - `add`: Base method to create a new toast.
 * - `remove`: Manually dismiss a toast by ID.
 * - `pauseDismissal` / `resumeDismissal`: Preserve the remaining lifetime during interaction.
 * - `triggerAction`: Executes the action callback for a specific toast.
 * - `success/error/info/undo`: Semantic shorthand methods.
 *
 * @sideeffects
 * - SCHEDULES `setTimeout` for automatic dismissal.
 * - MUTATES the global `toasts` reactive state.
 */
export function useToast() {
  /** Removes a toast's timer state, including any armed timeout. */
  function clearDismissalState(id: string) {
    const timerState = toastTimers.get(id);
    if (timerState && timerState.timeout !== null) {
      clearTimeout(timerState.timeout);
    }
    toastTimers.delete(id);
  }

  /** Arms the single service-owned timeout from the state's remaining lifetime. */
  function armDismissal(id: string, timerState: ToastTimerState) {
    if (timerState.remainingDurationMs <= 0) {
      remove(id);
      return;
    }

    timerState.deadlineMs = Date.now() + timerState.remainingDurationMs;
    timerState.timeout = setTimeout(() => remove(id), timerState.remainingDurationMs);
  }

  /**
   * Internal helper to create and track a new toast notification.
   *
   * @param options - Toast configuration without the ID.
   * @returns The generated UUID or timestamp-based ID for the toast.
   */
  function add(options: Omit<ToastOptions, "id">) {
    // [PERF] OPTIMIZATION: Use crypto-secure IDs (Optimization #42)
    // Rationale: Ensures uniqueness across the application lifecycle.
    const id = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random()}`;

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

    const duration = options.duration ?? DEFAULT_TOAST_DURATION_MS;
    const toast: ToastOptions = {
      id,
      ...options,
      duration,
      onAction: safeAction,
    };

    toasts.value.push(toast);

    // [GUARD] The service is the only toast lifetime owner. Presentation may
    // pause and resume this clock, but it never creates a competing timeout.
    if (duration !== 0) {
      const timerState: ToastTimerState = {
        remainingDurationMs: duration,
        deadlineMs: null,
        timeout: null,
      };
      toastTimers.set(id, timerState);
      armDismissal(id, timerState);
    }

    return id;
  }

  /**
   * Dismisses a toast and clears its associated timer.
   *
   * @param id - The ID of the toast to remove.
   */
  function remove(id: string) {
    clearDismissalState(id);
    const toastIndex = toasts.value.findIndex((activeToast) => activeToast.id === id);
    if (toastIndex !== -1) {
      toasts.value.splice(toastIndex, 1);
    }
  }

  /**
   * Pauses auto-dismissal without resetting the time already consumed.
   * Repeated pause requests are idempotent.
   */
  function pauseDismissal(id: string) {
    const timerState = toastTimers.get(id);
    if (!timerState || timerState.timeout === null || timerState.deadlineMs === null) return;

    clearTimeout(timerState.timeout);
    timerState.timeout = null;
    timerState.remainingDurationMs = Math.max(timerState.deadlineMs - Date.now(), 0);
    timerState.deadlineMs = null;
  }

  /**
   * Resumes auto-dismissal from the exact remaining lifetime.
   * Repeated resume requests are idempotent.
   */
  function resumeDismissal(id: string) {
    const timerState = toastTimers.get(id);
    if (!timerState || timerState.timeout !== null) return;
    armDismissal(id, timerState);
  }

  /**
   * Executes a toast's action and removes it from the queue.
   *
   * @remarks
   * Implements a brief lock to prevent accidental double-taps
   * on high-consequence actions like "UNDO".
   *
   * @param id - The ID of the toast whose action should be triggered.
   */
  function triggerAction(id: string) {
    if (processingIds.has(id)) return;

    const toastIndex = toasts.value.findIndex((activeToast) => activeToast.id === id);
    if (toastIndex !== -1) {
      processingIds.add(id);
      const toast = toasts.value[toastIndex];

      // Remove from UI and clear lifetime state before executing feature logic.
      remove(id);

      if (toast && toast.onAction) {
        toast.onAction();
      }

      // Lock to prevent multi-fire in rapid succession (Bug #22)
      setTimeout(() => {
        processingIds.delete(id);
      }, TOAST_ACTION_LOCK_DURATION_MS);
    }
  }

  return {
    toasts,
    add,
    remove,
    pauseDismissal,
    resumeDismissal,
    triggerAction,
    success: (message: string) => add({ type: "success", message }),
    error: (message: string) => add({ type: "error", message, duration: ERROR_TOAST_DURATION_MS }),
    info: (message: string) => add({ type: "info", message }),
    undo: (message: string, action: () => void) => add({
      type: "undo",
      message,
      actionLabel: "UNDO",
      onAction: action,
      duration: UNDO_TOAST_DURATION_MS,
    }),
  };
}
