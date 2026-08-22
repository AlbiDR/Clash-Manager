// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BaseCardSkeleton from "../BaseCardSkeleton.vue";

describe("BaseCardSkeleton.vue", () => {
  it("falls back to sane default widths when no bone was captured", () => {
    // getBone() returns undefined against the empty bones.generated.json
    // seeded by vitest.setup.ts - the component's own fallback (?? 120 / 80)
    // is what's under test here, not a captured value.
    const wrapper = mount(BaseCardSkeleton);

    expect(wrapper.classes()).toContain("sk-card");
    expect(wrapper.classes()).toContain("skeleton-anim");

    const playerName = wrapper.find(".sk-player-name");
    expect((playerName.element as HTMLElement).style.width).toBe("120px");

    const metaLine = wrapper.find(".sk-text-line-s");
    expect((metaLine.element as HTMLElement).style.width).toBe("80px");
  });

  it("renders the same fallback width regardless of the (now unused) index prop", () => {
    // Geometry now comes from a single build-time captured bone shared by
    // every card instance, not from a hand-authored per-index variety table.
    for (const index of [0, 1, 2, 3, 4, 5, 6]) {
      const wrapper = mount(BaseCardSkeleton, { props: { index } });

      const playerName = wrapper.find(".sk-player-name");
      expect((playerName.element as HTMLElement).style.width).toBe("120px");

      const metaLine = wrapper.find(".sk-text-line-s");
      expect((metaLine.element as HTMLElement).style.width).toBe("80px");
    }
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
