// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BaseCardSkeleton from "../BaseCardSkeleton.vue";

// Mocked rather than relying on bones.generated.json's actual on-disk content:
// that file may hold real captured geometry on any machine that has already
// run `pnpm run capture:skeletons` (e.g. a normal `pnpm dev`), which would
// make this test's expected widths depend on local capture state instead of
// being deterministic. Mocking getBone() to always return undefined isolates
// the component's own fallback behavior, which is what these tests exercise.
vi.mock("@core/theme/bones", () => ({ getBone: vi.fn(() => undefined) }));

describe("BaseCardSkeleton.vue", () => {
  it("falls back to sane default widths when no bone was captured", () => {
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
