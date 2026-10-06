// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref, shallowRef, triggerRef, type Ref } from "vue";
import { OVERLAY_ENTRY_KEY, resetDismissOnBackForTests, useDismissOnBack } from "../useDismissOnBack";

/**
 * jsdom's history.back() is asynchronous and fires popstate, like a browser,
 * so these run against the real History API rather than a mock of it.
 *
 * The router stand-in is added before the module's listener and with the same
 * capture flag, so it runs first, as vue-router does in the app: it adds its
 * listener at startup, and a browser runs window listeners in the order they
 * were added. (jsdom runs capture listeners first; a router added without
 * capture would wrongly look hidden here.) It remembers the address it is on,
 * so each pop it sees is either a route change or a same-address duplicate.
 *
 * The shared test setup replaces `location` with a frozen copy; this file puts
 * the live one back, because the module compares addresses.
 */
interface RouterPop {
  from: string;
  to: string;
}

// A history step takes two task rounds in jsdom; three steps' worth of rounds
// shows whether any further step was started.
const SETTLE_ROUNDS = 6;

let popCount = 0;
let popWaiters: Array<{ count: number; resolve: () => void }> = [];
let routerAt = "";
let routerPops: RouterPop[] = [];
let lateSaw: ReturnType<typeof vi.fn>;

function notePop(): void {
  popCount += 1;
  const ready = popWaiters.filter((waiter) => waiter.count <= popCount);
  popWaiters = popWaiters.filter((waiter) => waiter.count > popCount);
  // Settle one task later, once every popstate listener, the module's included, has run.
  ready.forEach((waiter) => setTimeout(waiter.resolve, 0));
}

function handleRouterPop(): void {
  routerPops.push({ from: routerAt, to: location.pathname });
  routerAt = location.pathname;
}

function waitForPops(pops: number): Promise<void> {
  const count = popCount + pops;
  return new Promise((resolve) => popWaiters.push({ count, resolve }));
}

/** Presses Back once and settles after `pops` popstate events, steps included. */
async function pressBack(pops = 1): Promise<void> {
  const settled = waitForPops(pops);
  history.back();
  await settled;
}

/** Presses Forward once and settles after `pops` popstate events, steps included. */
async function handleForwardPress(pops = 1): Promise<void> {
  const settled = waitForPops(pops);
  history.forward();
  await settled;
}

async function getPopsAfterSettling(): Promise<number> {
  for (let round = 0; round < SETTLE_ROUNDS; round++) await new Promise((resolve) => setTimeout(resolve, 0));
  return popCount;
}

/** vue-router's push: it writes `forward` into the entry it leaves, merging that entry's state, then adds one. */
function updateRouteByPush(path: string): void {
  const leaving = history.state as { position: number };
  history.replaceState({ ...leaving, forward: path }, "");
  history.pushState({ back: routerAt, current: path, forward: null, position: leaving.position + 1 }, "", path);
  routerAt = path;
}

/** vue-router's replace: it rewrites the current entry, merging its state, so an overlay id on it survives. */
function updateRouteByReplace(path: string): void {
  history.replaceState({ ...(history.state as object), current: path }, "", path);
  routerAt = path;
}

/** Adds a listener after the module's, the only kind its stopped pops are hidden from. */
function setLateListener(): void {
  window.addEventListener("popstate", lateSaw, { capture: true });
}

function getRouteChanges(): RouterPop[] {
  return routerPops.filter((pop) => pop.from !== pop.to);
}

describe("useDismissOnBack", () => {
  beforeEach(() => {
    vi.stubGlobal("location", document.location);
    history.replaceState({ position: 0, current: "/roster" }, "", "/roster");
    popCount = 0;
    popWaiters = [];
    routerAt = "/roster";
    routerPops = [];
    lateSaw = vi.fn();
    window.addEventListener("popstate", notePop, { capture: true });
    window.addEventListener("popstate", handleRouterPop, { capture: true });
  });

  afterEach(() => {
    window.removeEventListener("popstate", notePop, { capture: true });
    window.removeEventListener("popstate", handleRouterPop, { capture: true });
    window.removeEventListener("popstate", lateSaw, { capture: true });
    resetDismissOnBackForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function overlay(initiallyOpen = false, open: Ref<boolean> = ref(initiallyOpen)) {
    const close = vi.fn(() => { open.value = false; });
    const scope = effectScope();
    scope.run(() => useDismissOnBack(open, close));
    return { open, close, scope };
  }

  async function setOpen(sheet: { open: Ref<boolean> }, showing: boolean): Promise<void> {
    sheet.open.value = showing;
    await nextTick();
  }

  it("gives Back an entry to pop that keeps the router's own state", async () => {
    const sheet = overlay();
    const length = history.length;
    await setOpen(sheet, true);
    expect(history.length).toBe(length + 1);
    expect(history.state).toMatchObject({ position: 0, current: "/roster" });
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
  });

  it("pushes one entry however often the open state fires", async () => {
    const pushState = vi.spyOn(history, "pushState");
    // A shallow ref makes the watcher fire again on the same value.
    const sheet = overlay(false, shallowRef(false));
    await setOpen(sheet, true);
    triggerRef(sheet.open);
    await nextTick();
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay on Back; the router sees one same-address pop", async () => {
    const sheet = overlay();
    await setOpen(sheet, true);
    setLateListener();
    await pressBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(sheet.open.value).toBe(false);
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
    expect(lateSaw).not.toHaveBeenCalled();
  });

  it("removes its entry when closed some other way, so the next Back is not wasted", async () => {
    const sheet = overlay();
    await setOpen(sheet, true);
    setLateListener();
    const popped = waitForPops(1);
    await setOpen(sheet, false);
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(sheet.close).not.toHaveBeenCalled();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
    expect(lateSaw).not.toHaveBeenCalled();
  });

  it("closes only the top-most overlay per Back", async () => {
    const sheet = overlay();
    const dropdown = overlay();
    await setOpen(sheet, true);
    await setOpen(dropdown, true);

    await pressBack();
    expect(dropdown.close).toHaveBeenCalledTimes(1);
    expect(sheet.close).not.toHaveBeenCalled();
    expect(sheet.open.value).toBe(true);

    await pressBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(routerPops).toHaveLength(2);
    expect(getRouteChanges()).toEqual([]);
  });

  it("leaves Back to the router when nothing is open", async () => {
    updateRouteByPush("/settings");
    await pressBack();
    expect(getRouteChanges()).toEqual([{ from: "/settings", to: "/roster" }]);
  });

  it("releases its entry when the component goes away while open", async () => {
    const sheet = overlay(true);
    await nextTick();
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
    const popped = waitForPops(1);
    sheet.scope.stop();
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
  });

  describe("an entry left behind when its overlay closes under a newer one", () => {
    it("is stepped over in the same Back press after a push navigation", async () => {
      // The status popover stays open while a tap pushes another route, then closes.
      const popover = overlay();
      await setOpen(popover, true);
      updateRouteByPush("/headhunter");
      await setOpen(popover, false);
      expect(location.pathname).toBe("/headhunter");
      setLateListener();

      await pressBack(2);
      expect(location.pathname).toBe("/roster");
      expect(history.state).toMatchObject({ position: 0, current: "/roster" });
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(popover.close).not.toHaveBeenCalled();
      // One route change, then exactly one same-address pop for the step.
      expect(routerPops).toEqual([
        { from: "/headhunter", to: "/roster" },
        { from: "/roster", to: "/roster" },
      ]);
      // The route-changing pop is never stopped; only the step's duplicate is.
      expect(lateSaw).toHaveBeenCalledTimes(1);
      expect(await getPopsAfterSettling()).toBe(2);
    });

    it("is stepped over under a live overlay without a route change", async () => {
      const sheet = overlay();
      const dropdown = overlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      // The sheet closes by tap while the dropdown sits above it.
      await setOpen(sheet, false);

      await pressBack(2);
      expect(dropdown.close).toHaveBeenCalledTimes(1);
      expect(sheet.close).not.toHaveBeenCalled();
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(routerPops).toHaveLength(2);
      expect(getRouteChanges()).toEqual([]);
    });

    it("is stepped over when the overlay above it closes by tap", async () => {
      const sheet = overlay();
      const dropdown = overlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      await setOpen(sheet, false);

      const popped = waitForPops(2);
      await setOpen(dropdown, false);
      await popped;
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(getRouteChanges()).toEqual([]);
      expect(await getPopsAfterSettling()).toBe(2);
    });

    it("crosses a run of them one step per landing", async () => {
      const sheet = overlay();
      const dropdown = overlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      updateRouteByPush("/headhunter");
      await setOpen(dropdown, false);
      await setOpen(sheet, false);
      const back = vi.spyOn(history, "back");

      await pressBack(3);
      expect(location.pathname).toBe("/roster");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      // The press itself, then one step for each of the two dead entries.
      expect(back).toHaveBeenCalledTimes(3);
      expect(getRouteChanges()).toEqual([{ from: "/headhunter", to: "/roster" }]);
      expect(await getPopsAfterSettling()).toBe(3);
    });

    it("is stepped over by Forward too, and again by the next Back", async () => {
      const popover = overlay();
      await setOpen(popover, true);
      updateRouteByPush("/headhunter");
      await setOpen(popover, false);
      await pressBack(2);
      expect(location.pathname).toBe("/roster");

      await handleForwardPress(2);
      expect(location.pathname).toBe("/headhunter");
      expect(popover.open.value).toBe(false);

      await pressBack(2);
      expect(location.pathname).toBe("/roster");
      expect(getRouteChanges()).toEqual([
        { from: "/headhunter", to: "/roster" },
        { from: "/roster", to: "/headhunter" },
        { from: "/headhunter", to: "/roster" },
      ]);
      expect(await getPopsAfterSettling()).toBe(6);
    });

    it("is kept when a replace rewrote it to an address of its own", async () => {
      // A replace while the overlay is open rewrites its entry; the id survives the merge.
      const popover = overlay();
      await setOpen(popover, true);
      const id = history.state[OVERLAY_ENTRY_KEY];
      updateRouteByReplace("/settings");
      updateRouteByPush("/laboratory");
      await setOpen(popover, false);

      await pressBack();
      // Landed on an entry that carries the overlay's id at another address: a page, not a dead entry.
      expect(location.pathname).toBe("/settings");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBe(id);
      expect(await getPopsAfterSettling()).toBe(1);

      await pressBack();
      expect(location.pathname).toBe("/roster");
      expect(getRouteChanges()).toEqual([
        { from: "/laboratory", to: "/settings" },
        { from: "/settings", to: "/roster" },
      ]);
    });
  });

  describe("closing by tap", () => {
    it("pops its entry when the address is the one it opened on", async () => {
      const popover = overlay();
      await setOpen(popover, true);
      // A replace that comes back to the opening address counts as the same page.
      updateRouteByReplace("/settings");
      updateRouteByReplace("/roster");
      const back = vi.spyOn(history, "back");
      const popped = waitForPops(1);
      await setOpen(popover, false);
      await popped;
      expect(back).toHaveBeenCalledTimes(1);
      expect(location.pathname).toBe("/roster");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(getRouteChanges()).toEqual([]);
    });

    it("drops its id instead of stepping back after a replace moved the page", async () => {
      // The status popover stays open while the dock replaces the route, then a tap closes it.
      const popover = overlay();
      await setOpen(popover, true);
      updateRouteByReplace("/laboratory");
      const back = vi.spyOn(history, "back");
      await setOpen(popover, false);

      expect(await getPopsAfterSettling()).toBe(0);
      expect(back).not.toHaveBeenCalled();
      expect(location.pathname).toBe("/laboratory");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      // The router's keys on the page's entry are kept.
      expect(history.state).toMatchObject({ position: 0, current: "/laboratory" });
      expect(routerPops).toEqual([]);
    });

    it("is not stepped over later if the router writes the dropped id back", async () => {
      const popover = overlay();
      await setOpen(popover, true);
      const id = history.state[OVERLAY_ENTRY_KEY];
      updateRouteByReplace("/laboratory");
      await setOpen(popover, false);
      // vue-router's push merges the state it remembers, which still holds the id.
      history.replaceState({ ...(history.state as object), [OVERLAY_ENTRY_KEY]: id }, "");
      updateRouteByPush("/settings");

      await pressBack();
      expect(location.pathname).toBe("/laboratory");
      expect(getRouteChanges()).toEqual([{ from: "/settings", to: "/laboratory" }]);
      expect(await getPopsAfterSettling()).toBe(1);
    });
  });

  it("does not step over an entry carrying an id this page load never left behind", async () => {
    // Start listening, as any open overlay does.
    const sheet = overlay();
    await setOpen(sheet, true);
    const popped = waitForPops(1);
    await setOpen(sheet, false);
    await popped;

    // An id from an earlier load, or a malformed state, on the entry Back lands on.
    history.replaceState({ ...(history.state as object), [OVERLAY_ENTRY_KEY]: 1 }, "");
    updateRouteByPush("/settings");
    const back = vi.spyOn(history, "back");
    await pressBack();
    expect(location.pathname).toBe("/roster");
    expect(back).toHaveBeenCalledTimes(1);
    expect(await getPopsAfterSettling()).toBe(2);
  });

  it("lets Forward into a closed overlay's entry through and reopens nothing", async () => {
    const sheet = overlay();
    await setOpen(sheet, true);
    await pressBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);

    await handleForwardPress();
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
    expect(sheet.open.value).toBe(false);
    expect(sheet.close).toHaveBeenCalledTimes(1);
    // The module cannot know the router stayed put (a replace may have moved
    // it meanwhile), so the router judges it: here a same-address duplicate.
    expect(routerPops).toEqual([
      { from: "/roster", to: "/roster" },
      { from: "/roster", to: "/roster" },
    ]);
    expect(await getPopsAfterSettling()).toBe(2);
  });
});
