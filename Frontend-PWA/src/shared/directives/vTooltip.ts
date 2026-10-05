// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import type { Directive } from "vue";
import type { BenchmarkContentData } from "../../core";
import { useHaptics } from "../composables/useHaptics";
import { useGhostBenchmarkState } from "./ghostBenchmarkState";

/**
 * Ephemeral active target element for the singleton benchmark tooltip.
 *
 * @remarks
 * [DECISION LOG] EPHEMERAL: singleton state intentionally resets on full page reload.
 */
// EPHEMERAL: intentionally resets on cold start
let activeTarget: TooltipHTMLElement | null = null;

// EPHEMERAL: intentionally resets on cold start
/**
 * Timeout handle for debouncing the tooltip concealment sequence.
 * Ensures brief mouse gap transitions between close elements do not cause jitter.
 */
let hideTimer: number | null = null;

// EPHEMERAL: intentionally resets on cold start
/**
 * Indicates if the primary input hardware is a touch or high-latency pointer.
 *
 * @remarks
 * [DECISION LOG] Primary-input detection (coarse/touch vs. fine/mouse) drives
 * which interaction model applies: hover-to-show on fine pointers, tap-to-show
 * on coarse pointers. Re-evaluated live via matchMedia's change event so a
 * convertible/2-in-1 device switching input modes is picked up without reload.
 */
let isCoarsePointer = false;
if (typeof window !== "undefined" && window.matchMedia) {
  const pointerQuery = window.matchMedia("(pointer: coarse)");
  isCoarsePointer = pointerQuery.matches;
  pointerQuery.addEventListener("change", (queryChangeEvent) => {
    isCoarsePointer = queryChangeEvent.matches;
  });
}

/**
 * Extended HTMLElement interface carrying the raw tooltip value expando.
 *
 * @remarks
 * Eliminates custom dataset serialization costs and preserves type safety for rich `BenchmarkData` payloads.
 */
interface TooltipHTMLElement extends HTMLElement {
  /** Ephemeral storage representing the reactive tooltip value bound to the DOM node. */
  _tooltipValue?: BenchmarkContentData;
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
      if (typeof activeTarget?._tooltipValue === "object" && "kind" in activeTarget._tooltipValue) return;
      hide();
      activeTarget = null;
    }, 100);
  };

  // Mouse Delegation (fine pointer only)
  document.body.addEventListener("mouseover", (mouseOverEvent) => {
    const currentContent = useGhostBenchmarkState().active.value?.content;
    if (isCoarsePointer || (typeof currentContent === "object" && "kind" in currentContent)) return;
    const tooltipTarget = (mouseOverEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (tooltipTarget && !(typeof tooltipTarget._tooltipValue === "object" && "kind" in tooltipTarget._tooltipValue)) handleShow(tooltipTarget);
  });

  document.body.addEventListener("mouseout", (mouseOutEvent) => {
    if (isCoarsePointer) return;
    const tooltipTarget = (mouseOutEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (tooltipTarget && !(typeof tooltipTarget._tooltipValue === "object" && "kind" in tooltipTarget._tooltipValue)) handleHide();
  });

  // Tap delegation: ordinary tooltips use coarse pointers; score explanations use explicit clicks on every pointer.
  // [DECISION LOG] Replaces the previous 400ms long-press timer: a plain tap
  // opens the mobile sheet immediately, no ambiguous hold duration. Dismissal
  // is owned by GhostBenchmarkHost's sheet (backdrop tap / swipe-down).
  document.body.addEventListener("click", (clickEvent) => {
    const tooltipTarget = (clickEvent.target as HTMLElement).closest(
      "[data-v-tooltip]",
    ) as TooltipHTMLElement | null;
    if (!tooltipTarget) return;
    const isScore = typeof tooltipTarget._tooltipValue === "object" && "kind" in tooltipTarget._tooltipValue;
    if (isScore && activeTarget === tooltipTarget && useGhostBenchmarkState().active.value) {
      useGhostBenchmarkState().hide();
      activeTarget = null;
    } else if (isCoarsePointer || isScore) {
      handleShow(tooltipTarget, isCoarsePointer);
    }
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
 * pattern with event delegation on document.body; actual rendering happens
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
 * - The directive's value (BenchmarkContentData) is stored as an expando
 *   '_tooltipValue' on the DOM element for retrieval by the delegated handler.
 */
export const vTooltip: Directive<TooltipHTMLElement, BenchmarkContentData> = {
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
