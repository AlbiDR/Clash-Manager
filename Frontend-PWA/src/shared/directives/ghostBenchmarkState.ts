// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import type { BenchmarkContentData } from "../../core";

/**
 * Snapshot of an active ghost-benchmark popup: the content to render, and the
 * anchor rect (captured at show-time) used to position the desktop popover.
 *
 * @remarks Satisfies ADR Section III: Component Contracts & Shared UI.
 */
export interface GhostBenchmarkEntry {
  /** Structured benchmark comparison payload. */
  content: BenchmarkContentData;
  /** Bounding rectangle of the anchor element captured at presentation time. */
  anchorRect: DOMRect;
  /** Stepper controller for stepping through chart series without dismissing sheet. */
  stepper: GhostBenchmarkStepper | null;
}

/**
 * Lets the mobile sheet step through a series (for example the bars of a
 * history chart) without being dismissed, so a mistapped entry costs one tap.
 *
 * @remarks
 * The owner of the series keeps the selection: `go` moves it by one entry and
 * the owner calls `show` again for the new entry, so the sheet never closes
 * and re-opens between steps. Satisfies ADR Section III: Interaction Contracts.
 */
export interface GhostBenchmarkStepper {
  /** 1-based position of the shown entry. */
  position: number;
  /** Number of entries in the series. */
  total: number;
  /**
   * Moves the selection one entry towards the older (-1) or newer (1) end.
   *
   * @param direction - Direction delta (-1 for older, 1 for newer).
   */
  go: (direction: -1 | 1) => void;
}

/**
 * Global reactive state for the single active ghost-benchmark popup.
 *
 * @remarks
 * Module-level singleton, mirroring the pattern in `useConfirm` (@core/services):
 * a shared ref declared outside the exported function so every caller of
 * `useGhostBenchmarkState()` observes and mutates the same state, with no
 * store/DI mechanism required.
 */
const active = ref<GhostBenchmarkEntry | null>(null);

/**
 * True while the sheet should ignore a backdrop click that belongs to the touch
 * which opened it.
 *
 * @remarks
 * Threat: Instant Backdrop Dismissal Race Condition on Mobile Touch.
 * A chart opens the sheet when the finger lifts, and the browser then sends the
 * click that completes that same tap to whatever is under the finger: the new
 * backdrop, which would dismiss the sheet the instant it appeared. The host
 * ignores that one click and clears this flag as soon as any new touch begins,
 * so no timer is involved and a genuine dismiss tap is never swallowed.
 */
const ignoreBackdropClick = ref(false);

/**
 * COMPOSABLE: useGhostBenchmarkState
 *
 * Bridges the `v-tooltip` directive (which detects show/hide interactions on
 * arbitrary DOM elements) and `GhostBenchmarkHost` (the single Vue component
 * that renders the desktop popover or mobile sheet). The directive writes via
 * `show`/`hide`; the host reads `active` reactively.
 *
 * @remarks Satisfies ADR Section III: Reactive Shared UI State.
 *
 * @returns Object containing reactive state refs and controller functions:
 * - `active`: Reactive ref of the current popup entry (null when idle).
 * - `show`: Activates the popup for the given anchor element, content, and optional stepper.
 * - `hide`: Deactivates the popup.
 * - `ignoreBackdropClick`: Ref flag armed by owners opening on pointer release to guard backdrop taps.
 */
export function useGhostBenchmarkState() {
  /**
   * Shows a ghost-benchmark popup anchored to the provided DOM element.
   *
   * @param el - DOM element used as anchor for popover position calculation.
   * @param content - Benchmark payload to render in popover/sheet.
   * @param stepper - Optional stepper interface for step-by-step series navigation.
   */
  function show(
    el: HTMLElement,
    content: BenchmarkContentData,
    stepper: GhostBenchmarkStepper | null = null,
  ) {
    // Capture anchor DOMRect snapshot immediately on show call to ensure accurate positioning
    active.value = { content, anchorRect: el.getBoundingClientRect(), stepper };
  }

  /**
   * Deactivates the current ghost-benchmark popup, resetting global active ref to null.
   */
  function hide() {
    // Clear global active ref to dismiss popover/sheet component
    active.value = null;
  }

  return { active, show, hide, ignoreBackdropClick };
}
