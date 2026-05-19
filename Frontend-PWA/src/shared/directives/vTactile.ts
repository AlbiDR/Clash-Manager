// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import type { Directive } from "vue";

interface TactileBinding {
  onTap: () => void;
  onLongPress: () => void;
}

interface TactileState {
  startX: number;
  startY: number;
  timer: number | null;
  isActive: boolean;
  isLongPress: boolean;
  listeners: {
    pointerdown: (e: PointerEvent) => void;
    pointermove: (e: PointerEvent) => void;
    pointerup: (e: PointerEvent) => void;
    pointercancel: (e: PointerEvent) => void;
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
              if (navigator.vibrate) navigator.vibrate(60);
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
            if (navigator.vibrate) navigator.vibrate(12);
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
