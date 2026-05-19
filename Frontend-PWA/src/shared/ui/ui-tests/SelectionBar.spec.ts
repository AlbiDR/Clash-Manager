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

vi.mock("../../../core/services/useHaptics", () => ({
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

  it("renders counts when active", () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 5, totalCount: 50 },
    });
    expect(wrapper.text()).toContain("5/50");
    expect(wrapper.text()).toContain("Done");
  });

  it("toggles score expansion and emits select-score on mode toggle", async () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
    });
    
    // Toggle Mode
    const modeBtn = wrapper.find(".mode-toggle");
    await modeBtn.trigger("click");
    expect(tapMock).toHaveBeenCalled();
    expect(wrapper.emitted("select-score")).toBeTruthy();
    expect(wrapper.emitted("select-score")![0]).toEqual([75, "le"]);

    // Expand
    const trigger = wrapper.find(".sp-trigger");
    await trigger.trigger("click");
    expect(wrapper.find(".value-picker").exists()).toBe(true);
  });

  it("emits select-score when a threshold is selected", async () => {
    const wrapper = mount(SelectionBar, {
      props: { count: 0, totalCount: 50 },
    });
    
    await wrapper.find(".sp-trigger").trigger("click");
    const options = wrapper.findAll(".val-opt");
    await options[0].trigger("click"); // 15
    
    expect(mediumMock).toHaveBeenCalled();
    expect(wrapper.emitted("select-score")).toBeTruthy();
    expect(wrapper.emitted("select-score")![0]).toEqual([15, "ge"]);
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
