// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import ConsoleHeader from "../ConsoleHeader.vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createCommentVNode, Fragment, h, nextTick } from "vue";

const { mockTap } = vi.hoisted(() => ({ mockTap: vi.fn() }));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({ tap: mockTap }),
}));

// useHeaderScroll is deliberately NOT mocked: the scrolled-state contract is driven
// through the real window scroll listener so the assertion covers the genuine chain
// (window.scrollY -> composable ref -> header class binding).

describe("ConsoleHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Guarantee every test starts at the top of the document.
    vi.stubGlobal("scrollY", 0);
  });

  it("renders title and optional status correctly", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Test Feature",
        status: { type: "success", text: "Verified" },
      },
    });

    expect(wrapper.find(".view-title").text()).toBe("Test Feature");
    expect(wrapper.findComponent({ name: "StatusPill" }).exists()).toBe(true);
  });

  it("does not create a controls region when a view forwards an empty Fragment", () => {
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Settings" },
      slots: {
        filters: () => [h(Fragment, null, [createCommentVNode("forwarded but empty")])],
      },
    });

    expect(wrapper.find(".header-controls").exists()).toBe(false);
  });

  it("opens the dashboard URL when the title is clicked", async () => {
    const dashboardUrl = "https://supabase.com/dashboard/project/test";
    // @ts-expect-error - Mocking window.open in JSDOM
    const windowSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Test Feature",
        dashboardUrl,
      },
    });

    const title = wrapper.find(".view-title");
    expect(title.classes()).toContain("is-link");

    await title.trigger("click");

    expect(mockTap).toHaveBeenCalled();
    expect(windowSpy).toHaveBeenCalledWith(dashboardUrl, "_blank");
    windowSpy.mockRestore();
  });

  it("opens the search field on demand and debounces what is typed into it", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "" },
    });

    // Idle, the control is an icon: there is no field to type into yet.
    expect(wrapper.find(".search-input").exists()).toBe(false);
    expect(wrapper.find(".search-trigger").exists()).toBe(true);

    await wrapper.find(".search-trigger").trigger("click");
    expect(wrapper.find(".search-input").exists()).toBe(true);

    await wrapper.find(".search-input").setValue("clash");
    expect(wrapper.emitted("update:search")).toBeUndefined();

    vi.advanceTimersByTime(300);
    expect(wrapper.emitted("update:search")?.[0]).toEqual(["clash"]);
    vi.useRealTimers();
  });

  it("keeps the field open while a query stands, so a filter can never hide", async () => {
    // The reader never opened it; the query alone is enough to pin it open.
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "adr" },
    });

    expect(wrapper.find(".search-input").exists()).toBe(true);
    expect(wrapper.find(".search-trigger").exists()).toBe(false);

    // A blur must not be able to dismiss it either.
    await wrapper.find(".search-input").trigger("blur");
    expect(wrapper.find(".search-input").exists()).toBe(true);
  });

  it("reflects the query it is given rather than keeping its own copy", () => {
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "leandro" },
    });

    expect((wrapper.find(".search-input").element as HTMLInputElement).value).toBe("leandro");
  });

  it("clears the query on Escape and reports it immediately", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "adr" },
    });

    await wrapper.find(".search-input").trigger("keydown", { key: "Escape" });

    // Immediately, without waiting out the debounce - a clear is not a keystroke.
    expect(wrapper.emitted("update:search")?.[0]).toEqual([""]);
    vi.useRealTimers();
  });

  it("offers a clear affordance only while there is something to clear", async () => {
    const idle = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "" },
    });
    await idle.find(".search-trigger").trigger("click");
    expect(idle.find(".search-clear").exists()).toBe(false);

    const active = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true, searchQuery: "adr" },
    });
    expect(active.find(".search-clear").exists()).toBe(true);

    await active.find(".search-clear").trigger("click");
    expect(active.emitted("update:search")?.[0]).toEqual([""]);
  });

  it("handles sort selection emission", async () => {
    const sortOptions = [
      { label: "Name", value: "name" },
      { label: "Level", value: "level" },
    ];
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Sort Test", showSearch: true, sortOptions, currentSort: "name" },
    });

    const select = wrapper.findComponent({ name: "BaseSelect" });
    await select.vm.$emit("update:modelValue", "level");

    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["level"]);
  });

  it("applies scrolled class based on scroll state", async () => {
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Scroll Test" },
    });

    expect(wrapper.classes()).not.toContain("is-scrolled");

    // ConsoleHeader calls useHeaderScroll(10), so anything past 10px is "scrolled".
    vi.stubGlobal("scrollY", 50);
    window.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(wrapper.classes()).toContain("is-scrolled");

    // Returning to the top must drop the class again.
    vi.stubGlobal("scrollY", 0);
    window.dispatchEvent(new Event("scroll"));
    await nextTick();

    expect(wrapper.classes()).not.toContain("is-scrolled");
  });

  it("applies scrolled class when mounted on an already-scrolled page", async () => {
    vi.stubGlobal("scrollY", 50);

    const wrapper = mount(ConsoleHeader, {
      props: { title: "Scroll Test" },
    });

    // useHeaderScroll runs its initial check inside onMounted, so the class lands
    // on the first flush rather than during the initial render.
    await nextTick();

    expect(wrapper.classes()).toContain("is-scrolled");
  });

  // Removed "toggles info overlay on button click" test as the overlay was removed
});
