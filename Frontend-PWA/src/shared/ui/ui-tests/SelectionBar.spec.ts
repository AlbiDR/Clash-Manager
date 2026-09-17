// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import SelectionBar from "../SelectionBar.vue";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const { tapMock, mediumMock } = vi.hoisted(() => ({
  tapMock: vi.fn(),
  mediumMock: vi.fn(),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: tapMock,
    medium: mediumMock,
  }),
}));

describe("SelectionBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollTo since JSDOM doesn't implement it
    Element.prototype.scrollTo = vi.fn();
  });

  it("renders correctly in idle state", () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
    });
    expect(wrapper.text()).toContain("Select");
    expect(wrapper.find(".count-pill").exists()).toBe(false);
  });

  it("joins an optional view control to the Select/Done action cluster", () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
      slots: { "view-options": '<button class="view-options-test-trigger">View</button>' },
    });

    expect(wrapper.find(".management").classes()).toContain("has-view-options");
    expect(wrapper.find(".view-options-test-trigger").exists()).toBe(true);
    const managementChildren = wrapper.find(".management").element.children;
    expect(managementChildren[0]?.classList).toContain("morph-btn");
    expect(managementChildren[1]?.classList).toContain("view-options-segment");
  });

  it("renders counts when active", () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 5, totalCount: 50 },
    });
    expect(wrapper.text()).toContain("Clear · 5");
    expect(wrapper.find(".morph-btn").attributes("aria-label")).toBe("Clear 5 selected");
    expect(wrapper.find(".count-pill").exists()).toBe(false);
  });

  it("emits select-score on mode toggle", async () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
    });

    await wrapper.find(".mode-toggle").trigger("click");

    expect(wrapper.emitted("select-score")).toBeTruthy();
    expect(wrapper.emitted("select-score")![0]).toEqual([75, "le"]);
  });

  it("emits select-score when the threshold is stepped", async () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
    });

    // Keyboard rather than a drag: this asserts the event reaches the bar, and
    // the slider's own pointer geometry is covered in its own spec.
    await wrapper.find(".sp-slider").trigger("keydown", { key: "ArrowLeft" });

    expect(wrapper.emitted("select-score")).toBeTruthy();
    expect(wrapper.emitted("select-score")![0]).toEqual([70, "ge"]);
  });

  it("emits clear when active action is clicked", async () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 10, totalCount: 50 },
    });
    
    await wrapper.find(".morph-btn").trigger("click");
    expect(wrapper.emitted("clear")).toBeTruthy();
  });

  it("shows loading state when prop is set", () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50, loading: true },
    });
    expect(wrapper.classes()).toContain("is-loading");
    expect(wrapper.find(".loading-overlay").exists()).toBe(true);
  });
});
