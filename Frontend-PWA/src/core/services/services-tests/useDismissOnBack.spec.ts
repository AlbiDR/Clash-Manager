// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { OVERLAY_ENTRY_KEY, resetDismissOnBackForTests, useDismissOnBack } from "../useDismissOnBack";

/**
 * jsdom's history.back() is asynchronous and fires popstate, like a browser,
 * so these run against the real History API rather than a mock of it. The
 * module stops the pops it handles, so the test watches from a capture
 * listener added before the module's own, and settles one task later, once
 * the module's handler has run.
 */
let popWaiters: Array<() => void> = [];
function notePop(): void {
  const waiters = popWaiters;
  popWaiters = [];
  waiters.forEach((resolve) => setTimeout(resolve, 0));
}

function waitForPop(): Promise<void> {
  return new Promise((resolve) => popWaiters.push(resolve));
}

async function pressBack(): Promise<void> {
  const popped = waitForPop();
  history.back();
  await popped;
}

describe("useDismissOnBack", () => {
  let routerSaw: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    history.replaceState({ position: 0, current: "/roster" }, "");
    routerSaw = vi.fn();
    window.addEventListener("popstate", notePop, { capture: true });
    // Stands in for the router's own listener, which is added without capture.
    window.addEventListener("popstate", routerSaw);
  });

  afterEach(() => {
    window.removeEventListener("popstate", notePop, { capture: true });
    window.removeEventListener("popstate", routerSaw);
    resetDismissOnBackForTests();
  });

  function overlay(initiallyOpen = false) {
    const open = ref(initiallyOpen);
    const close = vi.fn(() => { open.value = false; });
    const scope = effectScope();
    scope.run(() => useDismissOnBack(open, close));
    return { open, close, scope };
  }

  it("gives Back an entry to pop that keeps the router's own state", async () => {
    const sheet = overlay();
    const length = history.length;
    sheet.open.value = true;
    await nextTick();
    expect(history.length).toBe(length + 1);
    expect(history.state).toMatchObject({ position: 0, current: "/roster" });
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
  });

  it("closes the overlay on Back and keeps the router from seeing it", async () => {
    const sheet = overlay();
    sheet.open.value = true;
    await nextTick();
    await pressBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(sheet.open.value).toBe(false);
    expect(routerSaw).not.toHaveBeenCalled();
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
  });

  it("removes its entry when closed some other way, so the next Back is not wasted", async () => {
    const sheet = overlay();
    sheet.open.value = true;
    await nextTick();
    const popped = waitForPop();
    sheet.open.value = false;
    await nextTick();
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(sheet.close).not.toHaveBeenCalled();
    expect(routerSaw).not.toHaveBeenCalled();
  });

  it("closes only the top-most overlay per Back", async () => {
    const sheet = overlay();
    const dropdown = overlay();
    sheet.open.value = true;
    await nextTick();
    dropdown.open.value = true;
    await nextTick();

    await pressBack();
    expect(dropdown.close).toHaveBeenCalledTimes(1);
    expect(sheet.close).not.toHaveBeenCalled();
    expect(sheet.open.value).toBe(true);

    await pressBack();
    expect(sheet.close).toHaveBeenCalledTimes(1);
    expect(routerSaw).not.toHaveBeenCalled();
  });

  it("leaves Back to the router when nothing is open", async () => {
    history.pushState({ position: 1, current: "/settings" }, "");
    await pressBack();
    expect(routerSaw).toHaveBeenCalledTimes(1);
  });

  it("releases its entry when the component goes away while open", async () => {
    const sheet = overlay(true);
    await nextTick();
    expect(history.state[OVERLAY_ENTRY_KEY]).toEqual(expect.any(Number));
    const popped = waitForPop();
    sheet.scope.stop();
    await popped;
    expect(history.state[OVERLAY_ENTRY_KEY]).toBeUndefined();
    expect(routerSaw).not.toHaveBeenCalled();
  });
});
