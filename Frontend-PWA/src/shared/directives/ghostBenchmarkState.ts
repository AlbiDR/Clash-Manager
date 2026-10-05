// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import type { BenchmarkContentData } from "../../core";

/**
 * Snapshot of an active ghost-benchmark popup: the content to render, and the
 * anchor rect (captured at show-time) used to position the desktop popover.
 */
interface GhostBenchmarkEntry {
  content: BenchmarkContentData;
  anchorRect: DOMRect;
  stepper: GhostBenchmarkStepper | null;
}

/**
 * Lets the mobile sheet step through a series (for example the bars of a
 * history chart) without being dismissed, so a mistapped entry costs one tap.
 *
 * @remarks
 * The owner of the series keeps the selection: `go` moves it by one entry and
 * the owner calls `show` again for the new entry, so the sheet never closes
 * and re-opens between steps.
 */
export interface GhostBenchmarkStepper {
  /** 1-based position of the shown entry. */
  position: number;
  /** Number of entries in the series. */
  total: number;
  /** Moves the selection one entry towards the older (-1) or newer (1) end. */
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
 * @remarks
 * Bridges the `v-tooltip` directive (which detects show/hide interactions on
 * arbitrary DOM elements) and `GhostBenchmarkHost` (the single Vue component
 * that renders the desktop popover or mobile sheet). The directive writes via
 * `show`/`hide`; the host reads `active` reactively.
 *
 * @returns
 * - `active`: Reactive ref of the current popup entry (null when idle).
 * - `show`: Activates the popup for the given anchor element and content, with
 *   an optional stepper for series the sheet can walk through.
 * - `hide`: Deactivates the popup.
 * - `ignoreBackdropClick`: See above; armed by owners that open on pointer release.
 */
export function useGhostBenchmarkState() {
  function show(
    el: HTMLElement,
    content: BenchmarkContentData,
    stepper: GhostBenchmarkStepper | null = null,
  ) {
    active.value = { content, anchorRect: el.getBoundingClientRect(), stepper };
  }

  function hide() {
    active.value = null;
  }

  return { active, show, hide, ignoreBackdropClick };
}
