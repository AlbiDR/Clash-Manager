// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SkeletonSettingsCard from "../SkeletonSettingsCard.vue";

describe("SkeletonSettingsCard.vue", () => {
  it("renders with default widths when no index is provided", () => {
    const wrapper = mount(SkeletonSettingsCard);

    expect(wrapper.classes()).toContain("settings-card");
    expect(wrapper.classes()).toContain("skeleton-anim");

    const headerTitle = wrapper.find(".sk-line-m");
    expect((headerTitle.element as HTMLElement).style.width).toBe("160px");

    const descLines = wrapper.findAll(".sk-text-line-m");
    descLines.forEach((line) => {
      expect((line.element as HTMLElement).style.width).toBe("200px");
    });
  });

  it("calculates deterministic widths based on index prop", () => {
    const testCases = [
      { index: 0, expectedTitle: "160px", expectedDesc: "200px" },
      { index: 1, expectedTitle: "140px", expectedDesc: "180px" },
      { index: 2, expectedTitle: "180px", expectedDesc: "220px" },
      { index: 3, expectedTitle: "160px", expectedDesc: "190px" },
    ];

    testCases.forEach(({ index, expectedTitle, expectedDesc }) => {
      const wrapper = mount(SkeletonSettingsCard, {
        props: { index },
      });

      const headerTitle = wrapper.find(".sk-line-m");
      expect((headerTitle.element as HTMLElement).style.width).toBe(expectedTitle);

      const descLine = wrapper.find(".sk-text-line-m");
      expect((descLine.element as HTMLElement).style.width).toBe(expectedDesc);
    });
  });

  it("contains all essential skeleton structure elements", () => {
    const wrapper = mount(SkeletonSettingsCard);

    expect(wrapper.find(".card-header").exists()).toBe(true);
    expect(wrapper.find(".sk-icon-small").exists()).toBe(true);
    expect(wrapper.find(".card-body").exists()).toBe(true);
    expect(wrapper.find(".features-list").exists()).toBe(true);
    expect(wrapper.findAll(".toggle-row")).toHaveLength(3);
    expect(wrapper.findAll(".sk-badge-s")).toHaveLength(3);
  });

  it("matches snapshot", () => {
    const wrapper = mount(SkeletonSettingsCard, {
      props: { index: 1 }
    });
    expect(wrapper.html()).toMatchSnapshot();
  });
});
