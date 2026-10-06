// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref, shallowRef, triggerRef, type Ref } from "vue";
import { OVERLAY_ENTRY_KEY, resetDismissOnBackForTests, useDismissOnBack } from "../useDismissOnBack";

/**
 * jsdom's history.back() is asynchronous and fires popstate, like a browser,
 * so these run against the real History API rather than a mock of it.
 *
 * The router stand-in models vue-router's web history: its popstate listener
 * is added first and without capture, as the app adds the router's at
 * startup, and it remembers the state of the last entry it saw. Its push
 * merges that remembered state into the entry it leaves, as vue-router's does,
 * so a pop hidden from it would show up as an overlay id copied into a real
 * entry. Each pop it sees is a route change or a same-address duplicate.
 *
 * The shared test setup replaces `location` with a frozen copy; this file puts
 * the live one back, because the module compares addresses.
 */
interface RouterPop {
  from: string;
  to: string;
}

type HistoryState = Record<string, unknown> & { position: number };

let popCount = 0;
let popWaiters: Array<{ count: number; resolve: () => void }> = [];
let routerAt = "";
let routerState: HistoryState;
let routerPops: RouterPop[] = [];
let lateSaw: ReturnType<typeof vi.fn>;
// Task rounds one history step takes to fire its popstate, measured once.
let roundsPerStep = 0;

function handleObservedPop(): void {
  popCount += 1;
  const ready = popWaiters.filter((waiter) => waiter.count <= popCount);
  popWaiters = popWaiters.filter((waiter) => waiter.count > popCount);
  // Settle one task later, once every popstate listener, the module's included, has run.
  ready.forEach((waiter) => setTimeout(waiter.resolve, 0));
}

function handleRouterPop(event: PopStateEvent): void {
  routerPops.push({ from: routerAt, to: location.pathname });
  routerAt = location.pathname;
  routerState = event.state as HistoryState;
}

function fetchNextRound(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function fetchRoundsPerStep(): Promise<number> {
  let landed = false;
  const noteLanding = (): void => { landed = true; };
  history.pushState(history.state, "");
  window.addEventListener("popstate", noteLanding);
  history.back();
  let rounds = 0;
  while (!landed) {
    await fetchNextRound();
    rounds += 1;
  }
  window.removeEventListener("popstate", noteLanding);
  return rounds;
}

/** Resolves once `pops` more popstate events have fired, steps included. */
function fetchPopLandings(pops: number): Promise<void> {
  const count = popCount + pops;
  return new Promise((resolve) => popWaiters.push({ count, resolve }));
}

/**
 * Resolves with the pop count once a quiet window passes. Any step the module
 * starts begins inside a popstate listener, so its own popstate follows within
 * one step's rounds; a window one round longer with no new pop means none is
 * in flight.
 */
async function fetchSettledPopCount(): Promise<number> {
  let seen: number;
  do {
    seen = popCount;
    for (let round = 0; round <= roundsPerStep; round++) await fetchNextRound();
  } while (popCount !== seen);
  return popCount;
}

/** Presses Back once and settles after `pops` popstate events, steps included. */
async function updateHistoryByBack(pops = 1): Promise<void> {
  const settled = fetchPopLandings(pops);
  history.back();
  await settled;
}

/** Presses Forward once and settles after `pops` popstate events, steps included. */
async function updateHistoryByForward(pops = 1): Promise<void> {
  const settled = fetchPopLandings(pops);
  history.forward();
  await settled;
}

/** vue-router's push: writes `forward` into the entry it leaves, merging the state it remembers, then adds one. */
function updateRouteByPush(path: string): void {
  const leaving = { ...routerState, ...(history.state as HistoryState), forward: path };
  history.replaceState(leaving, "");
  routerState = { back: routerAt, current: path, forward: null, position: leaving.position + 1 };
  history.pushState(routerState, "", path);
  routerAt = path;
}

/** vue-router's replace: rewrites the current entry, merging its state, so an overlay id on it survives. */
function updateRouteByReplace(path: string): void {
  routerState = { ...(history.state as HistoryState), current: path, position: routerState.position };
  history.replaceState(routerState, "", path);
  routerAt = path;
}

/** Puts the router stand-in after the module's listener: the order WebKit and Gecko gave a capture listener. */
function setRouterAfterModule(): void {
  window.removeEventListener("popstate", handleRouterPop);
  window.addEventListener("popstate", handleRouterPop);
}

/** Adds a listener after the module's, to show the module hides no pop from anyone. */
function setLateListener(): void {
  window.addEventListener("popstate", lateSaw);
}

function getRouteChanges(): RouterPop[] {
  return routerPops.filter((pop) => pop.from !== pop.to);
}

function setBaseEntry(path: string): void {
  routerState = { position: 0, current: path };
  history.replaceState(routerState, "", path);
  routerAt = path;
}

describe("useDismissOnBack", () => {
  beforeAll(async () => {
    roundsPerStep = await fetchRoundsPerStep();
  });

  beforeEach(() => {
    vi.stubGlobal("location", document.location);
    setBaseEntry("/roster");
    popCount = 0;
    popWaiters = [];
    routerPops = [];
    lateSaw = vi.fn();
    window.addEventListener("popstate", handleObservedPop, { capture: true });
    // Added before any overlay opens, so before the module's listener, as in the app.
    window.addEventListener("popstate", handleRouterPop);
  });

  afterEach(() => {
    window.removeEventListener("popstate", handleObservedPop, { capture: true });
    window.removeEventListener("popstate", handleRouterPop);
    window.removeEventListener("popstate", lateSaw);
    resetDismissOnBackForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createOverlay(initiallyOpen = false, open: Ref<boolean> = ref(initiallyOpen)) {
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
    const sheet = createOverlay();
    const pushState = vi.spyOn(history, "pushState");
    await setOpen(sheet, true);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(history.state).toMatchObject({ position: 0, current: "/roster" });
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
  });

  it("pushes one entry however often the open state fires", async () => {
    const pushState = vi.spyOn(history, "pushState");
    // A shallow ref makes the watcher fire again on the same value.
    const sheet = createOverlay(false, shallowRef(false));
    await setOpen(sheet, true);
    triggerRef(sheet.open);
    await nextTick();
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("closes the overlay on Back; the router sees one same-address pop", async () => {
    const sheet = createOverlay();
    await setOpen(sheet, true);
    setLateListener();
    await updateHistoryByBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(sheet.open.value).toBe(false);
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
    // No pop is hidden, not even from a listener added after the module's.
    expect(lateSaw).toHaveBeenCalledTimes(1);
  });

  it("removes its entry when closed some other way, so the next Back is not wasted", async () => {
    const sheet = createOverlay();
    await setOpen(sheet, true);
    const popped = fetchPopLandings(1);
    await setOpen(sheet, false);
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(sheet.close).not.toHaveBeenCalled();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
  });

  it("closes only the top-most overlay per Back", async () => {
    const sheet = createOverlay();
    const dropdown = createOverlay();
    await setOpen(sheet, true);
    await setOpen(dropdown, true);

    await updateHistoryByBack();
    expect(dropdown.close).toHaveBeenCalledTimes(1);
    expect(sheet.close).not.toHaveBeenCalled();
    expect(sheet.open.value).toBe(true);

    await updateHistoryByBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(routerPops).toHaveLength(2);
    expect(getRouteChanges()).toEqual([]);
  });

  it("leaves Back to the router when nothing is open", async () => {
    updateRouteByPush("/settings");
    await updateHistoryByBack();
    expect(getRouteChanges()).toEqual([{ from: "/settings", to: "/roster" }]);
  });

  it("releases its entry when the component goes away while open", async () => {
    const sheet = createOverlay(true);
    await nextTick();
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
    const popped = fetchPopLandings(1);
    sheet.scope.stop();
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(routerPops).toEqual([{ from: "/roster", to: "/roster" }]);
  });

  describe("listener order", () => {
    // Chat 5's WebKit sequence: an overlay open on /a, a push to /b (the
    // overlay then closes), a push to /c, Back, Back; then a push and a Back
    // more, which bounced and skipped /a while a pop was hidden from the router.
    it.each([
      ["the router's listener runs first, as on every engine now", false],
      ["the module's listener runs first, as a capture listener did on WebKit and Gecko", true],
    ])("gives the same routes, with no bounce, when %s", async (_order, moduleFirst) => {
      setBaseEntry("/a");
      const popover = createOverlay();
      await setOpen(popover, true);
      if (moduleFirst) setRouterAfterModule();
      updateRouteByPush("/b");
      await setOpen(popover, false);
      updateRouteByPush("/c");

      await updateHistoryByBack();
      await updateHistoryByBack(2);
      expect(location.pathname).toBe("/a");
      expect(routerState[OVERLAY_ENTRY_KEY]).toBeUndefined();

      updateRouteByPush("/c");
      await updateHistoryByBack();
      expect(location.pathname).toBe("/a");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(await fetchSettledPopCount()).toBe(4);
      expect(routerPops).toEqual([
        { from: "/c", to: "/b" },
        { from: "/b", to: "/a" },
        { from: "/a", to: "/a" },
        { from: "/c", to: "/a" },
      ]);
    });
  });

  describe("an entry left behind when its overlay closes under a newer one", () => {
    it("is stepped over in the same Back press after a push navigation", async () => {
      // The status popover stays open while a tap pushes another route, then closes.
      const popover = createOverlay();
      await setOpen(popover, true);
      updateRouteByPush("/headhunter");
      await setOpen(popover, false);
      expect(location.pathname).toBe("/headhunter");
      setLateListener();

      await updateHistoryByBack(2);
      expect(location.pathname).toBe("/roster");
      expect(history.state).toMatchObject({ position: 0, current: "/roster" });
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(popover.close).not.toHaveBeenCalled();
      // One route change, then exactly one same-address pop for the step.
      expect(routerPops).toEqual([
        { from: "/headhunter", to: "/roster" },
        { from: "/roster", to: "/roster" },
      ]);
      expect(lateSaw).toHaveBeenCalledTimes(2);
      expect(await fetchSettledPopCount()).toBe(2);
    });

    it("is stepped over under a live overlay without a route change", async () => {
      const sheet = createOverlay();
      const dropdown = createOverlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      // The sheet closes by tap while the dropdown sits above it.
      await setOpen(sheet, false);

      await updateHistoryByBack(2);
      expect(dropdown.close).toHaveBeenCalledTimes(1);
      expect(sheet.close).not.toHaveBeenCalled();
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(routerPops).toHaveLength(2);
      expect(getRouteChanges()).toEqual([]);
    });

    it("is stepped over when the overlay above it closes by tap", async () => {
      const sheet = createOverlay();
      const dropdown = createOverlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      await setOpen(sheet, false);

      const popped = fetchPopLandings(2);
      await setOpen(dropdown, false);
      await popped;
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(getRouteChanges()).toEqual([]);
      expect(await fetchSettledPopCount()).toBe(2);
    });

    it("crosses a run of them one step per landing", async () => {
      const sheet = createOverlay();
      const dropdown = createOverlay();
      await setOpen(sheet, true);
      await setOpen(dropdown, true);
      updateRouteByPush("/headhunter");
      await setOpen(dropdown, false);
      await setOpen(sheet, false);
      const back = vi.spyOn(history, "back");

      await updateHistoryByBack(3);
      expect(location.pathname).toBe("/roster");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      // The press itself, then one step for each of the two dead entries.
      expect(back).toHaveBeenCalledTimes(3);
      expect(getRouteChanges()).toEqual([{ from: "/headhunter", to: "/roster" }]);
      expect(await fetchSettledPopCount()).toBe(3);
    });

    it("is stepped over by Forward too, and again by the next Back", async () => {
      const popover = createOverlay();
      await setOpen(popover, true);
      updateRouteByPush("/headhunter");
      await setOpen(popover, false);
      await updateHistoryByBack(2);
      expect(location.pathname).toBe("/roster");

      await updateHistoryByForward(2);
      expect(location.pathname).toBe("/headhunter");
      expect(popover.open.value).toBe(false);

      await updateHistoryByBack(2);
      expect(location.pathname).toBe("/roster");
      expect(getRouteChanges()).toEqual([
        { from: "/headhunter", to: "/roster" },
        { from: "/roster", to: "/headhunter" },
        { from: "/headhunter", to: "/roster" },
      ]);
      expect(await fetchSettledPopCount()).toBe(6);
    });

    it("is kept when a replace rewrote it to an address of its own", async () => {
      // A replace while the overlay is open rewrites its entry; the id survives the merge.
      const popover = createOverlay();
      await setOpen(popover, true);
      const id = history.state[OVERLAY_ENTRY_KEY];
      updateRouteByReplace("/settings");
      updateRouteByPush("/laboratory");
      await setOpen(popover, false);

      await updateHistoryByBack();
      // Landed on an entry that carries the overlay's id at another address: a page, not a dead entry.
      expect(location.pathname).toBe("/settings");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBe(id);
      expect(await fetchSettledPopCount()).toBe(1);

      await updateHistoryByBack();
      expect(location.pathname).toBe("/roster");
      expect(getRouteChanges()).toEqual([
        { from: "/laboratory", to: "/settings" },
        { from: "/settings", to: "/roster" },
      ]);
    });
  });

  describe("closing by tap", () => {
    it("pops its entry when the address is the one it opened on", async () => {
      const popover = createOverlay();
      await setOpen(popover, true);
      // A replace that comes back to the opening address counts as the same page.
      updateRouteByReplace("/settings");
      updateRouteByReplace("/roster");
      const back = vi.spyOn(history, "back");
      const popped = fetchPopLandings(1);
      await setOpen(popover, false);
      await popped;
      expect(back).toHaveBeenCalledTimes(1);
      expect(location.pathname).toBe("/roster");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      expect(getRouteChanges()).toEqual([]);
    });

    it("drops its id instead of stepping back after a replace moved the page", async () => {
      // The status popover stays open while the dock replaces the route, then a tap closes it.
      const popover = createOverlay();
      await setOpen(popover, true);
      updateRouteByReplace("/laboratory");
      const back = vi.spyOn(history, "back");
      await setOpen(popover, false);

      expect(await fetchSettledPopCount()).toBe(0);
      expect(back).not.toHaveBeenCalled();
      expect(location.pathname).toBe("/laboratory");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
      // The router's keys on the page's entry are kept.
      expect(history.state).toMatchObject({ position: 0, current: "/laboratory" });
      expect(routerPops).toEqual([]);
    });

    it("is not stepped over later when the router's push writes the dropped id back", async () => {
      const popover = createOverlay();
      await setOpen(popover, true);
      const id = history.state[OVERLAY_ENTRY_KEY];
      updateRouteByReplace("/laboratory");
      await setOpen(popover, false);
      // The router still remembers the replaced state, id included, and merges it into the entry it leaves.
      updateRouteByPush("/settings");

      await updateHistoryByBack();
      expect(location.pathname).toBe("/laboratory");
      expect(history.state[OVERLAY_ENTRY_KEY]).toBe(id);
      expect(getRouteChanges()).toEqual([{ from: "/settings", to: "/laboratory" }]);
      expect(await fetchSettledPopCount()).toBe(1);
    });
  });

  it("does not step over an entry carrying an id this page load never left behind", async () => {
    // Start listening, as any open overlay does.
    const sheet = createOverlay();
    await setOpen(sheet, true);
    const popped = fetchPopLandings(1);
    await setOpen(sheet, false);
    await popped;

    // An id from an earlier load, or a malformed state, on the entry Back lands on.
    history.replaceState({ ...(history.state as object), [OVERLAY_ENTRY_KEY]: 1 }, "");
    updateRouteByPush("/settings");
    const back = vi.spyOn(history, "back");
    await updateHistoryByBack();
    expect(location.pathname).toBe("/roster");
    expect(back).toHaveBeenCalledTimes(1);
    expect(await fetchSettledPopCount()).toBe(2);
  });

  it("does not let a pop that never landed stand in for a later Back", async () => {
    // The module's own pop fires no popstate, as a step at the start of history does.
    const sheet = createOverlay();
    await setOpen(sheet, true);
    vi.spyOn(history, "back").mockImplementationOnce(() => undefined);
    await setOpen(sheet, false);
    expect(await fetchSettledPopCount()).toBe(0);

    // The next open settles it, so this Back is read as the user's and closes the dropdown.
    const dropdown = createOverlay();
    await setOpen(dropdown, true);
    await updateHistoryByBack();
    expect(dropdown.close).toHaveBeenCalledTimes(1);
    expect(dropdown.open.value).toBe(false);
  });

  it("lets Forward into a closed overlay's entry through and reopens nothing", async () => {
    const sheet = createOverlay();
    await setOpen(sheet, true);
    await updateHistoryByBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);

    await updateHistoryByForward();
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
    expect(sheet.open.value).toBe(false);
    expect(sheet.close).toHaveBeenCalledTimes(1);
    // The router judges it: here a same-address duplicate.
    expect(routerPops).toEqual([
      { from: "/roster", to: "/roster" },
      { from: "/roster", to: "/roster" },
    ]);
    expect(await fetchSettledPopCount()).toBe(2);
  });
});
