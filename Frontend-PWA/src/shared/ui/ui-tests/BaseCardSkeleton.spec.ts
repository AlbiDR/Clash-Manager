// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseCardSkeleton from "../BaseCardSkeleton.vue";

describe("BaseCardSkeleton.vue", () => {
  it("renders with default widths when no index is provided", () => {
    const wrapper = mount(BaseCardSkeleton);

    expect(wrapper.classes()).toContain("sk-card");
    expect(wrapper.classes()).toContain("skeleton-anim");

    const playerName = wrapper.find(".sk-player-name");
    expect((playerName.element as HTMLElement).style.width).toBe("120px");

    const metaLine = wrapper.find(".sk-text-line-s");
    expect((metaLine.element as HTMLElement).style.width).toBe("80px");
  });

  it("calculates deterministic widths based on index prop", () => {
    const testCases = [
      { index: 0, expectedName: "120px", expectedMeta: "80px" },
      { index: 1, expectedName: "140px", expectedMeta: "90px" },
      { index: 2, expectedName: "90px", expectedMeta: "60px" },
      { index: 3, expectedName: "130px", expectedMeta: "85px" },
      { index: 4, expectedName: "100px", expectedMeta: "70px" },
      { index: 5, expectedName: "150px", expectedMeta: "75%" },
    ];

    testCases.forEach(({ index, expectedName, expectedMeta }) => {
      const wrapper = mount(BaseCardSkeleton, {
        props: { index },
      });

      const playerName = wrapper.find(".sk-player-name");
      expect((playerName.element as HTMLElement).style.width).toBe(expectedName);

      const metaLine = wrapper.find(".sk-text-line-s");
      expect((metaLine.element as HTMLElement).style.width).toBe(expectedMeta);
    });
  });

  it("cycles widths correctly using modulo", () => {
    const wrapper = mount(BaseCardSkeleton, {
      props: { index: 6 }, // 6 % 6 = 0
    });

    const playerName = wrapper.find(".sk-player-name");
    expect((playerName.element as HTMLElement).style.width).toBe("120px");
  });

  it("contains all essential skeleton structure elements", () => {
    const wrapper = mount(BaseCardSkeleton);

    expect(wrapper.find(".sk-header-group").exists()).toBe(true);
    expect(wrapper.find(".sk-meta-stack").exists()).toBe(true);
    expect(wrapper.findAll(".sk-badge-s")).toHaveLength(2);
    expect(wrapper.find(".sk-info").exists()).toBe(true);
    expect(wrapper.find(".sk-trophy-meta").exists()).toBe(true);
    expect(wrapper.find(".sk-icon-dot").exists()).toBe(true);
    expect(wrapper.find(".sk-header-actions").exists()).toBe(true);
    expect(wrapper.find(".sk-box").exists()).toBe(true);
    expect(wrapper.find(".sk-icon-btn-s").exists()).toBe(true);
  });
});
