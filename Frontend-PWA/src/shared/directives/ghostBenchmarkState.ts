// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref } from "vue";
import type { BenchmarkData } from "../../core";

/**
 * Snapshot of an active ghost-benchmark popup: the content to render, and the
 * anchor rect (captured at show-time) used to position the desktop popover.
 */
export interface GhostBenchmarkEntry {
  content: BenchmarkData | string;
  anchorRect: DOMRect;
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
 * - `show`: Activates the popup for the given anchor element and content.
 * - `hide`: Deactivates the popup.
 */
export function useGhostBenchmarkState() {
  function show(el: HTMLElement, content: BenchmarkData | string) {
    active.value = { content, anchorRect: el.getBoundingClientRect() };
  }

  function hide() {
    active.value = null;
  }

  return { active, show, hide };
}
