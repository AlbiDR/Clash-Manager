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
 * entry makes true. On popstate the module closes every overlay opened after
 * the entry Back returned to. An overlay closed any other way removes its own
 * entry with one history.back(), unless a replace navigation has moved that
 * entry to another page; then it only drops its id from it (see release).
 *
 * The router handles every one of these pops first, on every engine. Its
 * popstate listener is added at startup and this module's on the first open,
 * both without capture, and listeners on one target without capture run in
 * the order they were added. A pop that keeps the address is a duplicate
 * navigation for the router: same route, nothing on screen changes. The
 * module never stops a pop. It used to, from a capture listener, which WebKit
 * and Gecko run ahead of the router's: the router then kept a dead entry's
 * state, its next push copied the id into a real entry, and Back from the next
 * page bounced forward and then skipped the page below. Never add capture or
 * a stop here: the router must see where every pop lands.
 *
 * [FIX] An overlay that closes while a newer entry sits on its own cannot
 * remove that entry. This happens after a push navigation from under a
 * non-modal overlay (the status popover, a dropdown) that then closes. Back
 * from the new route used to land on the dead entry, which has the address of
 * the entry below it, so a second press was needed to get past it.
 * handleDeadEntry now steps over it in the same press.
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
  /** Address the overlay opened on, compared with the live address when it closes. */
  href: string;
  close: () => void;
}

/** An entry left in history by an overlay that closed while a newer entry sat on it. */
interface DeadEntry {
  /** Address the overlay opened on, which its entry shares with the entry below. */
  href: string;
  /** Whether the user is below it, having been stepped over it by Back. */
  below: boolean;
}

const openOverlays: OpenOverlay[] = [];
const deadEntries = new Map<number, DeadEntry>();
// Ids grow across page loads too, so an entry left by an earlier load always
// compares as older than anything opened since.
let nextId = Date.now();
// Set while a pop this module started has yet to land; see handlePopState.
let ownPopPending = false;
let listening = false;

function entryId(state: unknown): number {
  const id = (state as Record<string, unknown> | null)?.[OVERLAY_ENTRY_KEY];
  return typeof id === "number" ? id : 0;
}

/**
 * Steps over a dead entry that Back or Forward has just landed on, so one
 * press moves the user past it. Back goes on to the entry below, which has
 * the same address. Forward goes on to the entry that sat above it when it
 * died, which still exists: the user never rests on a dead entry, and a push
 * from anywhere below one removes it along with what was above it. Each landing starts at most one step and the next landing is judged
 * afresh, so a run of dead entries is crossed one per pop. An id this page
 * load never left behind (a malformed state, an entry from an earlier load)
 * is never stepped over, and neither is a dead entry the router has since
 * rewritten to another address with a replace: that is a page of its own.
 */
function handleDeadEntry(landed: number): void {
  const dead = deadEntries.get(landed);
  if (!dead || dead.href !== location.href) return;
  const forward = dead.below;
  dead.below = !forward;
  ownPopPending = true;
  if (forward) history.forward();
  else history.back();
}

function handlePopState(event: PopStateEvent): void {
  // A pop this module started lands as the next popstate. One that never lands
  // (a step at the start of history fires none) is settled by the next
  // popstate of any kind, here, or by the next open(), so it can never be
  // taken for the landing of a later Back.
  const ownPop = ownPopPending;
  ownPopPending = false;
  const landed = entryId(event.state);

  if (!ownPop) {
    // Back returned to `landed`: every overlay opened after it has lost its entry.
    const closing = openOverlays.filter((overlay) => overlay.id > landed);
    // Ids only grow, so the overlays being closed are the newest ones: the end of the list.
    openOverlays.splice(openOverlays.length - closing.length, closing.length);
    for (let index = closing.length - 1; index >= 0; index--) closing[index].close();
  }

  handleDeadEntry(landed);
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  // No capture: the router, added first, must handle every pop before this.
  window.addEventListener("popstate", handlePopState);
  listening = true;
}

function open(close: () => void): number {
  ensureListening();
  // The push below drops every entry ahead of this one, among them any dead
  // entry the user was stepped back over. A pop of this module's still
  // awaited can no longer land where it was aimed, so it is settled too.
  for (const [id, dead] of deadEntries) if (dead.below) deadEntries.delete(id);
  ownPopPending = false;
  const id = ++nextId;
  history.pushState({ ...(history.state as object | null), [OVERLAY_ENTRY_KEY]: id }, "");
  openOverlays.push({ id, href: location.href, close });
  return id;
}

function release(id: number): void {
  const index = openOverlays.findIndex((overlay) => overlay.id === id);
  // Already gone: Back closed it and its entry with it.
  if (index === -1) return;
  const overlay = openOverlays[index];
  openOverlays.splice(index, 1);
  if (entryId(history.state) === id) {
    if (location.href === overlay.href) {
      ownPopPending = true;
      history.back();
      return;
    }
    // A replace navigation rewrote this entry to another page while the
    // overlay was open, keeping the id: it is that page's entry now. Stepping
    // back would leave the page for the one the overlay opened on, so only
    // the id is dropped. The router's own copy of the state still holds it
    // and its next push writes it back; that is harmless, because only ids
    // recorded in deadEntries are ever stepped over.
    const state = { ...(history.state as Record<string, unknown>) };
    delete state[OVERLAY_ENTRY_KEY];
    history.replaceState(state, "");
    return;
  }
  // Only the newest entry can be removed. One left lower down (the overlay was
  // not on top, or a push navigation happened while it was open) stays behind
  // as a dead entry; handleDeadEntry steps over it when Back or Forward lands
  // on it, so it never costs the user a press.
  deadEntries.set(id, { href: overlay.href, below: false });
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

/** Test support: forget every open overlay and dead entry, and stop listening. */
export function resetDismissOnBackForTests(): void {
  openOverlays.length = 0;
  deadEntries.clear();
  ownPopPending = false;
  if (listening) window.removeEventListener("popstate", handlePopState);
  listening = false;
}
