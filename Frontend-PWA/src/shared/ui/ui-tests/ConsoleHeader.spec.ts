// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import ConsoleHeader from "../ConsoleHeader.vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

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

  it("opens the dashboard URL when the title is clicked", async () => {
    const dashboardUrl = "https://supabase.com/dashboard/project/test";
    // @ts-ignore - Mocking window.open in JSDOM
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

  it("handles search input emission", async () => {
    vi.useFakeTimers();
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Search Test", showSearch: true },
    });

    const input = wrapper.find(".search-input");
    await input.setValue("clash");
    
    vi.advanceTimersByTime(300);
    expect(wrapper.emitted("update:search")?.[0]).toEqual(["clash"]);
    vi.useRealTimers();
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
