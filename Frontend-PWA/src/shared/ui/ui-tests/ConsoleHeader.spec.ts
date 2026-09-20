// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import ConsoleHeader from "../ConsoleHeader.vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createCommentVNode, Fragment, h, nextTick } from "vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { mockTap } = vi.hoisted(() => ({ mockTap: vi.fn() }));
const consoleHeaderSource = readFileSync(resolve(process.cwd(), "src/shared/ui/ConsoleHeader.vue"), "utf8");

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

  it("forwards a status-detail refresh without adding a permanent header action", async () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Roster",
        status: { type: "success", text: "DB", nominal: true },
        remoteInfo: { source: "SUPABASE", dataAge: "4m ago" },
      },
    });

    const statusPill = wrapper.findComponent({ name: "StatusPill" });
    await statusPill.vm.$emit("refresh");

    expect(wrapper.emitted("refresh")).toEqual([[]]);
    expect(wrapper.find(".header-controls").exists()).toBe(false);
  });

  it("keeps vertical leading inside the ellipsized title's clipping boundary", () => {
    // Ellipsis requires overflow clipping. The 24px title needs a 28.8px line
    // box (not 26.4px) so browser rounding cannot crop its bottom pixels.
    expect(consoleHeaderSource).toMatch(/\.view-title\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(consoleHeaderSource).toMatch(/\.view-title\s*\{[\s\S]*?line-height:\s*1\.2;/);
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

  it("does not create a permanent controls row for search and order", () => {
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
  });

  it("uses the compact count when a filtered badge reaches a narrow title rail", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Search Test",
        stats: { label: "Members", value: "2 of 38", compactValue: "2/38" },
      },
    });

    expect(wrapper.find(".title-label").classes()).toContain("has-compact-value");
    expect(wrapper.find(".count-value-full").text()).toBe("2 of 38");
    expect(wrapper.find(".count-value-compact").text()).toBe("2/38");
  });

  it("keeps each header-pressure stage independently addressable", () => {
    const wrapper = mount(ConsoleHeader, {
      props: {
        title: "Headhunter",
        stats: { label: "Recruits", value: "50" },
        status: { type: "success", text: "DB", nominal: true },
      },
    });

    const titleLabel = wrapper.find(".title-label");
    expect(titleLabel.attributes("aria-label")).toBe("50 Recruits");
    expect(titleLabel.find(".count-value").attributes("aria-hidden")).toBe("true");
    expect(titleLabel.find(".count-label").attributes("aria-hidden")).toBe("true");
    expect(wrapper.find(".title-main").exists()).toBe(true);
  });

  it("does not reserve a blank filter row before the selection action", () => {
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
    expect(toolbarClasses).toEqual(["selection-actions"]);
    expect(wrapper.find(".refinement-controls").exists()).toBe(false);

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
