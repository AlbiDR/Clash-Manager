// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import ViewOptions from "../ViewOptions.vue";

const SORT_OPTIONS = [
  { label: "Performance", value: "performance", desc: "Highest-performing members first." },
  { label: "Activity", value: "activity", desc: "Most recently active members first." },
];

function mountOptions(overrides: Record<string, unknown> = {}) {
  return mount(ViewOptions, {
    props: {
      title: "Roster",
      open: false,
      showSearch: true,
      searchQuery: "",
      sortOptions: SORT_OPTIONS,
      currentSort: "performance",
      ...overrides,
    },
    global: { stubs: { Teleport: true } },
  });
}

afterEach(() => {
  document.body.style.overflow = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ViewOptions", () => {
  it("is a compact, labelled trigger until the reader asks to shape the view", async () => {
    const wrapper = mountOptions();

    expect(wrapper.find(".view-options-panel").exists()).toBe(false);
    expect(wrapper.find(".view-options-trigger").attributes("aria-expanded")).toBe("false");

    await wrapper.find(".view-options-trigger").trigger("click");

    expect(wrapper.emitted("update:open")?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it("debounces a search query while keeping the active order visible", async () => {
    vi.useFakeTimers();
    const wrapper = mountOptions({ open: true });

    expect(wrapper.find(".view-options-search-input").exists()).toBe(true);
    expect(wrapper.find(".view-options-current-order").text()).toBe("Performance");

    await wrapper.find(".view-options-search-input").setValue("adr");
    expect(wrapper.emitted("update:search")).toBeUndefined();

    vi.advanceTimersByTime(300);
    expect(wrapper.emitted("update:search")?.[0]).toEqual(["adr"]);
    wrapper.unmount();
  });

  it("reports an order change and closes after the reader chooses it", async () => {
    const wrapper = mountOptions({ open: true });

    await wrapper.findAll(".view-options-sort-option")[1]?.trigger("click");

    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["activity"]);
    expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it("resets both active dimensions without forcing the panel closed", async () => {
    const wrapper = mountOptions({
      open: true,
      searchQuery: "adr",
      currentSort: "activity",
    });

    await wrapper.find(".view-options-reset").trigger("click");

    expect(wrapper.emitted("update:search")?.[0]).toEqual([""]);
    expect(wrapper.emitted("update:sort")?.[0]).toEqual(["performance"]);
    expect(wrapper.emitted("update:open")).toBeUndefined();
    wrapper.unmount();
  });

  it("uses Escape to clear a live search before dismissing the panel", async () => {
    const wrapper = mountOptions({ open: true, searchQuery: "adr" });

    await wrapper.find(".view-options-search-input").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("update:search")?.[0]).toEqual([""]);
    expect(wrapper.emitted("update:open")).toBeUndefined();
    wrapper.unmount();
  });

  it("uses the same scroll-locked bottom sheet on every input device", async () => {
    const wrapper = mountOptions({ open: true });
    await nextTick();

    expect(wrapper.find(".view-options-sheet").exists()).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    wrapper.unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
