// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { SkeletonSettingsCard } from "@shared";

describe("SkeletonSettingsCard.vue", () => {
  it("falls back to sane default widths when no bone was captured", () => {
    // getBone() returns undefined against the empty bones.generated.json
    // seeded by vitest.setup.ts - the component's own fallback (?? 160,
    // scaled x1.25 for the description) is what's under test here.
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

  it("renders the same fallback width regardless of the (now unused) index prop", () => {
    // Geometry now comes from a single build-time captured bone shared by
    // every card instance, not from a hand-authored per-index variety table.
    for (const index of [0, 1, 2, 3]) {
      const wrapper = mount(SkeletonSettingsCard, { props: { index } });

      const headerTitle = wrapper.find(".sk-line-m");
      expect((headerTitle.element as HTMLElement).style.width).toBe("160px");

      const descLine = wrapper.find(".sk-text-line-m");
      expect((descLine.element as HTMLElement).style.width).toBe("200px");
    }
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
