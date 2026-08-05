// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import type { Directive } from "vue";
import type { BenchmarkData } from "../../core";
import { useHaptics } from "../composables/useHaptics";
import { useGhostBenchmarkState } from "./ghostBenchmarkState";

// Singleton Interaction State
// [DECISION LOG] EPHEMERAL: singleton state intentionally resets on full page reload.
let activeTarget: HTMLElement | null = null;
let hideTimer: number | null = null;

// [DECISION LOG] Primary-input detection (coarse/touch vs. fine/mouse) drives
// which interaction model applies: hover-to-show on fine pointers, tap-to-show
// on coarse pointers. Re-evaluated live via matchMedia's change event so a
// convertible/2-in-1 device switching input modes is picked up without reload.
let isCoarsePointer = false;
if (typeof window !== "undefined" && window.matchMedia) {
  const pointerQuery = window.matchMedia("(pointer: coarse)");
  isCoarsePointer = pointerQuery.matches;
  pointerQuery.addEventListener("change", (queryChangeEvent) => {
    isCoarsePointer = queryChangeEvent.matches;
  });
}

// Typing for element-bound values to fix any usage
interface TooltipHTMLElement extends HTMLElement {
  _tooltipValue?: BenchmarkData | string;
}

if (typeof window !== "undefined") {
  const haptics = useHaptics();
  const { show, hide } = useGhostBenchmarkState();

  const handleShow = (el: TooltipHTMLElement, isTap = false) => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    const value = el._tooltipValue;
    if (!value) return;
    activeTarget = el;
    show(el, value);
    // [DECISION LOG] Haptics reserved for the mobile tap-to-open gesture only.
    // Firing on every desktop hover (the previous behavior) was noise, not signal.
    if (isTap) haptics.tap();
  };

  const handleHide = () => {
    hideTimer = window.setTimeout(() => {
      hide();
      activeTarget = null;
    }, 100);
  };

  // Mouse Delegation (fine pointer only)
  document.body.addEventListener("mouseover", (mouseOverEvent) => {
    if (isCoarsePointer) return;
    const tooltipTarget = (mouseOverEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (tooltipTarget) handleShow(tooltipTarget);
  });

  document.body.addEventListener("mouseout", (mouseOutEvent) => {
    if (isCoarsePointer) return;
    const tooltipTarget = (mouseOutEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (tooltipTarget) handleHide();
  });

  // Tap Delegation (coarse pointer only)
  // [DECISION LOG] Replaces the previous 400ms long-press timer: a plain tap
  // opens the mobile sheet immediately, no ambiguous hold duration. Dismissal
  // is owned by GhostBenchmarkHost's sheet (backdrop tap / swipe-down).
  document.body.addEventListener("click", (clickEvent) => {
    if (!isCoarsePointer) return;
    const tooltipTarget = (clickEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (tooltipTarget) handleShow(tooltipTarget, true);
  });
}

/**
 * V-TOOLTIP DIRECTIVE
 * Provides an interactive ghost-benchmark popup for strings or BenchmarkData.
 *
 * @remarks
 * This directive is a Layer 2 (@shared) molecule. It provides a context-blind
 * information overlay that remains consistent across all business features.
 * To maintain performance and prevent DOM bloat, it utilizes a singleton
 * pattern with event delegation on document.body — actual rendering happens
 * once, in `GhostBenchmarkHost.vue`, driven by the shared `ghostBenchmarkState`.
 *
 * Architectural Constraints:
 * - Must not import from @features or @app.
 * - Implements delegated listeners to avoid attaching thousands of mouse events.
 *
 * Interaction Model:
 * - Fine pointer (desktop): hover to show, 100ms debounced hide on mouseout.
 * - Coarse pointer (mobile): tap to show; dismissed via the sheet's own
 *   backdrop tap or swipe-down gesture.
 *
 * Reactive State:
 * - The directive's value (BenchmarkData | string) is stored as an expando
 *   '_tooltipValue' on the DOM element for retrieval by the delegated handler.
 */
export const vTooltip: Directive<TooltipHTMLElement, BenchmarkData | string> = {
  mounted(el, binding) {
    el._tooltipValue = binding.value;
    if (binding.value) {
      el.setAttribute("data-v-tooltip", "true");
    }
  },
  updated(el, binding) {
    el._tooltipValue = binding.value;
    if (binding.value) {
      el.setAttribute("data-v-tooltip", "true");
    } else {
      el.removeAttribute("data-v-tooltip");
    }
  },
  unmounted(el) {
    if (activeTarget === el) {
      useGhostBenchmarkState().hide();
      activeTarget = null;
    }
    delete el._tooltipValue;
  }
};
