// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import type { Directive } from "vue";
import { useHaptics } from "../composables/useHaptics";

/**
 * Interface contract representing the optional callback functions that can be bound
 * to the `v-tactile` directive to handle user tap and long press interactions.
 *
 * @remarks
 * Direct callback bindings are managed dynamically to prevent performance bottlenecks on
 * continuous touch gestures.
 */
interface TactileBinding {
  /** Optional callback triggered immediately upon a valid tap gesture. */
  onTap?: () => void;
  /** Optional callback triggered after a continuous hold exceeding the 500ms long-press threshold. */
  onLongPress?: () => void;
}

/**
 * Tracks the ephemeral, element-specific touch interaction state.
 *
 * @remarks
 * State is stored in a WeakMap keyed by HTMLElement to ensure garbage collection
 * when components are unmounted, preventing memory leaks in high-frequency views.
 */
interface TactileState {
  /** X-coordinate of the touch/pointer start point. Used for DPI-aware movement tolerance checking. */
  startX: number;
  /** Y-coordinate of the touch/pointer start point. Used for DPI-aware movement tolerance checking. */
  startY: number;
  /** Browser timeout handle for scheduling the 500ms long-press execution timer. */
  timer: number | null;
  /** High-performance boolean flag indicating if a tactile interaction sequence is active on the element. */
  isActive: boolean;
  /** Indicates whether the current gesture has met the criteria and duration to be classified as a long-press. */
  isLongPress: boolean;
  /**
   * Bound event handlers mapped directly to pointer and browser native event APIs.
   * Captured locally to allow deterministic cleanup upon unmounting.
   */
  listeners: {
    /** Pointerdown handler. Evaluates button, prevents child conflict, and schedules the long-press timer. */
    pointerdown: (e: PointerEvent) => void;
    /** Pointermove handler. Measures distance from origin point against devicePixelRatio-aware movement tolerance. */
    pointermove: (e: PointerEvent) => void;
    /** Pointerup handler. Evaluates tap trigger criteria, triggers brokered haptics, and clears active state. */
    pointerup: (e: PointerEvent) => void;
    /** Pointercancel handler. Aborts current gesture immediately on system/browser interruption. */
    pointercancel: (e: PointerEvent) => void;
    /** Contextmenu handler. Prevents default context menus on mobile devices during active long-press scenarios. */
    contextmenu: (e: Event) => void;
  };
}

const stateMap = new WeakMap<HTMLElement, TactileState>();

/**
 * V-TACTILE DIRECTIVE
 * Provides high-performance tap and long-press haptic interaction.
 *
 * @remarks
 * This directive is a Layer 2 (@shared) molecule. It provides a standardized
 * interaction model for the entire application, ensuring that haptic feedback
 * and touch interactions remain consistent across features. It implements the
 * 'Tactile Interaction' protocol as defined in the Frontend Bible.
 *
 * Key Interaction Thresholds:
 * - Tap: Instant trigger on pointerup if move threshold not exceeded.
 * - Long Press: 500ms continuous hold.
 * - Haptic (Tap): 12ms vibration.
 * - Haptic (Long Press): 60ms vibration.
 * - Movement Tolerance: 10px (DPI-aware).
 */
export const vTactile: Directive<HTMLElement, TactileBinding> = {
  mounted(el, binding) {
    const haptics = useHaptics();
    const state: TactileState = {
      startX: 0,
      startY: 0,
      timer: null,
      isActive: false,
      isLongPress: false,
      listeners: {
        pointerdown: (e: PointerEvent) => {
          if (e.button !== 0) return;

          const target = e.target as HTMLElement;
          // ARCHITECTURAL PROTECTION: Ignore interactions on actionable children.
          // This prevents nested interaction conflicts when a tactile container
          // contains standard buttons or links (Bug #14).
          if (
            target.closest(".btn-action") ||
            target.closest("a") ||
            target.closest(".hit-target")
          )
            return;

          state.isActive = true;
          state.isLongPress = false;
          state.startX = e.clientX;
          state.startY = e.clientY;

          if (state.timer) clearTimeout(state.timer);

          state.timer = window.setTimeout(() => {
            if (state.isActive) {
              state.isLongPress = true;
              haptics.longPress();
              if (binding.value?.onLongPress) {
                binding.value.onLongPress();
              }
            }
          }, 500);
        },

        pointermove: (e: PointerEvent) => {
          if (!state.isActive) return;

          // PERFORMANCE: High-DPI aware threshold (Bug #16).
          // Multiplied by devicePixelRatio to ensure the 'wiggle' tolerance
          // feels consistent across low-end and high-end mobile displays.
          const moveThreshold = 10 * (window.devicePixelRatio || 1);
          const dx = Math.abs(e.clientX - state.startX);
          const dy = Math.abs(e.clientY - state.startY);

          if (dx > moveThreshold || dy > moveThreshold) {
            clearInteraction();
          }
        },

        pointerup: () => {
          if (state.isActive && !state.isLongPress) {
            haptics.tap();
            if (binding.value?.onTap) {
              binding.value.onTap();
            }
          }
          clearInteraction();
        },

        pointercancel: () => {
          clearInteraction();
        },

        contextmenu: (e: Event) => {
          // Prevent browser context menu during long-press scenarios
          e.preventDefault();
        },
      },
    };

    const clearInteraction = () => {
      state.isActive = false;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
    };

    el.addEventListener("pointerdown", state.listeners.pointerdown);
    el.addEventListener("pointermove", state.listeners.pointermove);
    el.addEventListener("pointerup", state.listeners.pointerup);
    el.addEventListener("pointercancel", state.listeners.pointercancel);
    el.addEventListener("contextmenu", state.listeners.contextmenu);

    stateMap.set(el, state);
  },

  unmounted(el) {
    const state = stateMap.get(el);
    if (state) {
      el.removeEventListener("pointerdown", state.listeners.pointerdown);
      el.removeEventListener("pointermove", state.listeners.pointermove);
      el.removeEventListener("pointerup", state.listeners.pointerup);
      el.removeEventListener("pointercancel", state.listeners.pointercancel);
      el.removeEventListener("contextmenu", state.listeners.contextmenu);
      if (state.timer) clearTimeout(state.timer);
      stateMap.delete(el);
    }
  },
};
