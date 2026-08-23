// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { SkeletonSettingsCard } from "@shared";

// Mocked rather than relying on bones.generated.json's actual on-disk content:
// that file may hold real captured geometry on any machine that has already
// run `pnpm run capture:skeletons` (e.g. a normal `pnpm dev`), which would
// make this test's expected widths depend on local capture state instead of
// being deterministic. Mocking getBone() to always return undefined isolates
// the component's own fallback (?? 160, scaled x1.25 for the description).
vi.mock("@core/theme/bones", () => ({ getBone: vi.fn(() => undefined) }));

describe("SkeletonSettingsCard.vue", () => {
  it("falls back to sane default widths when no bone was captured", () => {
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
