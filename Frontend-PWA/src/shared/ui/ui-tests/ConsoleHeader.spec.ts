// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import ConsoleHeader from "../ConsoleHeader.vue";
import ViewOptions from "../ViewOptions.vue";
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

  it("keeps search and order out of the permanent controls row", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Search Test",
        showSearch: true,
        searchQuery: "",
        sortOptions: [{ label: "Performance", value: "performance" }],
        currentSort: "performance",
      },
    });

    expect(wrapper.find(".header-controls").exists()).toBe(false);
    expect(wrapper.findComponent(ViewOptions).exists()).toBe(true);
  });

  it("passes the controlled search and order state into the unified view control", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Search Test",
        showSearch: true,
        searchQuery: "adr",
        sortOptions: [{ label: "Performance", value: "performance", desc: "Best first." }],
        currentSort: "performance",
      },
    });

    expect(wrapper.findComponent(ViewOptions).props()).toMatchObject({
      title: "Search Test",
      open: false,
      showSearch: true,
      searchQuery: "adr",
      currentSort: "performance",
    });
  });

  it("handles sort selection emission", async () => {
    const sortOptions = [
      { label: "Name", value: "name" },
      { label: "Level", value: "level" },
    ];
    const wrapper = mount(ConsoleHeader, {
      props: { title: "Sort Test", showSearch: true, sortOptions, currentSort: "name" },
    });

    const viewOptions = wrapper.findComponent(ViewOptions);
    await viewOptions.vm.$emit("update:sort", "level");

    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["level"]);
  });

  it("orders list controls from refinement to the matching selection action", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Headhunter",
        showSearch: true,
        sortOptions: [{
          label: "Potential",
          value: "potential",
          desc: "Predicted account quality vs Clan baseline.",
        }],
        currentSort: "potential",
      },
      slots: { extra: '<div class="selection-tools-test" />' },
    });

    const toolbarClasses = Array.from(wrapper.find(".header-controls").element.children)
      .map((element) => element.className);
    expect(toolbarClasses).toEqual(["refinement-controls", "selection-actions"]);
    expect(wrapper.find(".refinement-controls").element.children).toHaveLength(0);

    const viewOptions = wrapper.findComponent(ViewOptions);
    expect(viewOptions.props("sortOptions")?.[0]).toMatchObject({
      label: "Potential",
      desc: "Predicted account quality vs Clan baseline.",
    });
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
