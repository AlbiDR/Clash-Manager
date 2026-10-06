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
 * entry with one history.back().
 *
 * The router sees every one of these pops. Window listeners run in the order
 * they were added, whatever their capture flag, and the router adds its
 * listener at startup, before the first overlay opens. A pop that keeps the
 * address is a duplicate navigation for the router: same route, nothing on
 * screen changes. Stopping such a pop only spares listeners added after this
 * module's. Never register this listener ahead of the router: the router must
 * see where every pop lands, because its next push copies the state it last
 * saw into the entry it leaves, and a dead entry's id copied that way would
 * make a real entry look dead.
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
  /** Address the overlay opened on; a Back that changes it is a real navigation. */
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
// Pops this module started itself, oldest first, each with the address it left.
const pendingPops: string[] = [];
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
  pendingPops.push(location.href);
  if (forward) history.forward();
  else history.back();
}

function handlePopState(event: PopStateEvent): void {
  const left = pendingPops.shift();
  const landed = entryId(event.state);
  let addressKept = false;

  if (left !== undefined) {
    // A pop this module started: it kept the address if it landed where it left.
    addressKept = location.href === left;
  } else {
    // Back returned to `landed`: every overlay opened after it has lost its entry.
    const closing = openOverlays.filter((overlay) => overlay.id > landed);
    if (closing.length > 0) {
      // Ids only grow, so the overlays being closed are the newest ones: the end of the list.
      openOverlays.splice(openOverlays.length - closing.length, closing.length);
      for (let index = closing.length - 1; index >= 0; index--) closing[index].close();
      // The oldest one closed opened on the address Back returned to, unless
      // the route changed underneath; then this pop is a real navigation.
      addressKept = location.href === closing[0].href;
    }
  }

  handleDeadEntry(landed);
  // Best effort: only listeners added after this one miss it (see the module notes).
  if (addressKept) event.stopImmediatePropagation();
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("popstate", handlePopState, { capture: true });
  listening = true;
}

function open(close: () => void): number {
  ensureListening();
  // The push below drops every entry ahead of this one, among them any dead
  // entry the user was stepped back over.
  for (const [id, dead] of deadEntries) if (dead.below) deadEntries.delete(id);
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
    pendingPops.push(location.href);
    history.back();
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
  pendingPops.length = 0;
  if (listening) window.removeEventListener("popstate", handlePopState, { capture: true });
  listening = false;
}
