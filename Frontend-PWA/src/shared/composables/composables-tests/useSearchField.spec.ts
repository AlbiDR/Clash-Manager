// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Covers the two claims `useSearchField` makes that its host cannot: the rule
 * that keeps a live filter visible, and the timer that must not outlive the
 * component it was started in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, h, ref, nextTick, KeepAlive } from "vue";
import { mount } from "@vue/test-utils";
import { useSearchField } from "../useSearchField";

/**
 * Mounts the composable inside a throwaway host so its lifecycle hooks bind to
 * something real. Returns the controller plus the query the host owns, which is
 * how the composable is meant to be used: it reads a query it does not own.
 */
function mountSearchField(initialQuery = "", onQueryChange = vi.fn()) {
  const query = ref(initialQuery);
  const focusInput = vi.fn();
  const blurInput = vi.fn();
  let controller!: ReturnType<typeof useSearchField>;

  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useSearchField({
          readQuery: () => query.value,
          onQueryChange: (next) => {
            query.value = next;
            onQueryChange(next);
          },
          focusInput,
          blurInput,
        });
        return () => h("div");
      },
    }),
  );

  return { controller, query, wrapper, onQueryChange, focusInput, blurInput };
}

describe("useSearchField", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts closed when there is nothing to show", () => {
    const { controller } = mountSearchField("");
    expect(controller.isOpen.value).toBe(false);
    expect(controller.hasQuery.value).toBe(false);
  });

  it("is open whenever a query stands, even though nobody opened it", () => {
    const { controller } = mountSearchField("adr");
    expect(controller.isOpen.value).toBe(true);
  });

  it("refuses to close while a query stands", () => {
    const { controller } = mountSearchField("adr");
    controller.closeSearchField();
    // This is the rule the whole collapsed design rests on: a filter may not
    // hide behind an icon, so closing an active field is simply not possible.
    expect(controller.isOpen.value).toBe(true);
  });

  it("closes on request once the query is gone", () => {
    const { controller } = mountSearchField("");
    controller.openSearchField();
    expect(controller.isOpen.value).toBe(true);
    controller.closeSearchField();
    expect(controller.isOpen.value).toBe(false);
  });

  it("moves focus into the field after it exists, not before", async () => {
    const { controller, focusInput } = mountSearchField("");
    controller.openSearchField();
    expect(focusInput).not.toHaveBeenCalled();
    await nextTick();
    expect(focusInput).toHaveBeenCalledOnce();
  });

  it("debounces typing and reports only the settled value", () => {
    const { controller, onQueryChange } = mountSearchField("");
    const type = (value: string) =>
      controller.handleSearchInput({ target: { value } } as unknown as Event);

    type("a");
    type("an");
    type("ang");
    expect(onQueryChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith("ang");
  });

  it("clears immediately rather than waiting out the debounce", () => {
    const { controller, onQueryChange } = mountSearchField("adr");
    controller.clearSearchField();
    expect(onQueryChange).toHaveBeenCalledExactlyOnceWith("");
    expect(controller.isOpen.value).toBe(false);
  });

  it("lets Escape through when the field has no work to do", () => {
    const { controller } = mountSearchField("");
    const event = { key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    controller.handleSearchKeydown(event);
    // Nothing to clear and nothing open, so the key belongs to whatever else
    // wants it - a dialog above, for instance.
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("claims Escape when there is a query, and clears it", () => {
    const { controller, onQueryChange, blurInput } = mountSearchField("adr");
    const event = { key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    controller.handleSearchKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onQueryChange).toHaveBeenCalledWith("");
    expect(blurInput).toHaveBeenCalled();
  });

  it("does not fire a pending debounce into an unmounted component", () => {
    const { controller, onQueryChange, wrapper } = mountSearchField("");
    controller.handleSearchInput({ target: { value: "ang" } } as unknown as Event);

    wrapper.unmount();
    vi.advanceTimersByTime(1000);

    // [THREAT:] the reason the cleanup exists - typing and leaving immediately
    // used to leave a timer that woke up inside a component that was gone.
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("settles query immediately on Enter keypress and cancels pending debounce", () => {
    const { controller, onQueryChange } = mountSearchField("");
    controller.handleSearchInput({ target: { value: "settled" } } as unknown as Event);

    const event = { key: "Enter", target: { value: "settled" }, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    controller.handleSearchKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(onQueryChange).toHaveBeenCalledWith("settled");

    // Fast-forward remaining debounce time to confirm it does not trigger a duplicate call
    vi.advanceTimersByTime(500);
    expect(onQueryChange).toHaveBeenCalledOnce();
  });

  it("ignores unhandled keys without preventing default", () => {
    const { controller } = mountSearchField("");
    const event = { key: "Tab", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    controller.handleSearchKeydown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("resets revealed state and cancels pending debounce on deactivation under KeepAlive", async () => {
    const query = ref("");
    const onQueryChange = vi.fn();
    let controller!: ReturnType<typeof useSearchField>;

    const Child = defineComponent({
      setup() {
        controller = useSearchField({
          readQuery: () => query.value,
          onQueryChange,
        });
        return () => h("div");
      },
    });

    const active = ref(true);
    const Parent = defineComponent({
      setup() {
        return () => h(KeepAlive, null, [active.value ? h(Child, { key: "child" }) : null]);
      },
    });

    mount(Parent);
    controller.openSearchField();
    expect(controller.isOpen.value).toBe(true);

    controller.handleSearchInput({ target: { value: "pending" } } as unknown as Event);

    active.value = false;
    await nextTick();

    expect(controller.isOpen.value).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(onQueryChange).not.toHaveBeenCalled();
  });
});
