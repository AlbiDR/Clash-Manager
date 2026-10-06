// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * COMPOSABLE: useDismissOnBack (Layer 1 - @core)
 *
 * @remarks
 * Makes Back close the top-most open overlay (sheet, dialog, dropdown,
 * popover) instead of leaving the screen behind it.
 *
 * [FIX] Nothing intercepted Back while an overlay was open. In the Android
 * app the shell only steps the WebView back while its history can go back,
 * so on a tab's first screen Back sent the whole app to the home screen and
 * left the sheet open for the next launch; in a browser it navigated away.
 * The earlier useBackHandler pushed a history entry for this but was never
 * used, and would have left that entry behind whenever an overlay closed by
 * tap, costing a dead Back press each time.
 *
 * How it works: opening an overlay pushes one history entry that copies the
 * router's own state and adds an id, so Back has something to pop; the
 * Android shell steps the WebView back as soon as it can go back, which this
 * entry makes true. The popstate listener runs in the capture phase, ahead of
 * the router's, and closes every overlay opened after the entry Back returned
 * to. When the page stayed on the same address the event is stopped there, so
 * the router never sees it and runs no guard or loader. An overlay closed any
 * other way removes its own entry, and that pop is swallowed the same way.
 *
 * [ARCHITECTURE] ADR LAYER: @core
 * - Permitted Imports: Layer 0 substrate and Layer 1 kernels.
 * - Forbidden Imports: Any logic or components from Layer 2+ (Shared, Features, App).
 */
import { onScopeDispose, watch, type WatchSource } from "vue";

/** The key this module adds to a history state; the router's own keys are kept. */
export const OVERLAY_ENTRY_KEY = "cmOverlay";

interface OpenOverlay {
  id: number;
  /** Address the overlay opened on; a Back that changes it is a real navigation. */
  href: string;
  close: () => void;
}

const openOverlays: OpenOverlay[] = [];
// Ids grow across page loads too, so an entry left by an earlier load always
// compares as older than anything opened since.
let nextId = Date.now();
// Pops this module started itself, to remove the entry of an overlay closed by tap.
let pendingSelfPops = 0;
let listening = false;

function entryId(state: unknown): number {
  const id = (state as Record<string, unknown> | null)?.[OVERLAY_ENTRY_KEY];
  return typeof id === "number" ? id : 0;
}

function handlePopState(event: PopStateEvent): void {
  if (pendingSelfPops > 0) {
    pendingSelfPops -= 1;
    event.stopImmediatePropagation();
    return;
  }

  // Back returned to `kept`: every overlay opened after it has lost its entry.
  const kept = entryId(event.state);
  const closing = openOverlays.filter((overlay) => overlay.id > kept);
  if (closing.length === 0) return;

  // Ids only grow, so the overlays being closed are the newest ones: the end of the list.
  openOverlays.splice(openOverlays.length - closing.length, closing.length);
  for (let index = closing.length - 1; index >= 0; index--) closing[index].close();

  // The oldest one closed opened on the address Back returned to, unless the
  // route changed underneath; then this pop is the router's to handle too.
  if (location.href === closing[0].href) event.stopImmediatePropagation();
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", handlePopState, { capture: true });
  listening = true;
}

function open(close: () => void): number {
  ensureListening();
  const id = ++nextId;
  history.pushState({ ...(history.state as object | null), [OVERLAY_ENTRY_KEY]: id }, "");
  openOverlays.push({ id, href: location.href, close });
  return id;
}

function release(id: number): void {
  const index = openOverlays.findIndex((overlay) => overlay.id === id);
  // Already gone: Back closed it and its entry with it.
  if (index === -1) return;
  openOverlays.splice(index, 1);
  // Only the newest entry can be removed. One left lower down (the overlay was
  // not on top, or the route changed while it was open) is skipped by the
  // `kept` comparison when Back reaches it.
  if (entryId(history.state) === id) {
    pendingSelfPops += 1;
    history.back();
  }
}

/**
 * Closes the overlay on Back while `isOpen` is true.
 *
 * @param isOpen - Whether the overlay is showing.
 * @param close - Closes it; called when Back is pressed while it is the top-most.
 */
export function useDismissOnBack(isOpen: WatchSource<boolean>, close: () => void): void {
  let id: number | null = null;

  const stop = watch(isOpen, (showing) => {
    if (showing && id === null) {
      id = open(() => {
        id = null;
        close();
      });
    } else if (!showing && id !== null) {
      release(id);
      id = null;
    }
  }, { immediate: true });

  onScopeDispose(() => {
    stop();
    if (id !== null) release(id);
    id = null;
  });
}

/** Test support: forget every open overlay and stop listening. */
export function resetDismissOnBackForTests(): void {
  openOverlays.length = 0;
  pendingSelfPops = 0;
  if (listening) window.removeEventListener("popstate", handlePopState, { capture: true });
  listening = false;
}
