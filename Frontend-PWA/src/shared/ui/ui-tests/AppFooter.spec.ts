// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount } from "@vue/test-utils";
import AppFooter from "../AppFooter.vue";
import * as hapticsModule from "../../../core/services/useHaptics";

// Mock useHaptics from the actual file
vi.mock("../../../core/services/useHaptics", () => ({
  useHaptics: vi.fn(() => ({
    heavy: vi.fn(),
  })),
}));

describe("AppFooter.vue", () => {
  const version = "1.2.3";
  const badge = "BETA";

  beforeEach(() => {
    vi.clearAllMocks();
    // Stub window.location.reload
    vi.stubGlobal("location", { reload: vi.fn() });
  });

  it("renders the version correctly", () => {
    const wrapper = shallowMount(AppFooter, {
      props: { version },
      global: {
        directives: {
          tactile: {},
        },
      },
    });

    expect(wrapper.text()).toContain(`CLASH MANAGER V${version}`);
  });

  it("renders the badge when provided", () => {
    const wrapper = shallowMount(AppFooter, {
      props: { version, badge },
      global: {
        directives: {
          tactile: {},
        },
      },
    });

    const badgeSpan = wrapper.find(".demo-tag");
    expect(badgeSpan.exists()).toBe(true);
    expect(badgeSpan.text()).toBe(badge);
  });

  it("does not render the badge when not provided", () => {
    const wrapper = shallowMount(AppFooter, {
      props: { version },
      global: {
        directives: {
          tactile: {},
        },
      },
    });

    expect(wrapper.find(".demo-tag").exists()).toBe(false);
  });

  it("calls haptics.heavy and window.location.reload on click", async () => {
    const heavySpy = vi.fn();
    vi.mocked(hapticsModule.useHaptics).mockReturnValue({
      heavy: heavySpy,
    } as any);

    const wrapper = shallowMount(AppFooter, {
      props: { version },
      global: {
        directives: {
          tactile: {},
        },
      },
    });

    await wrapper.find(".brand").trigger("click");

    expect(heavySpy).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();
  });
});
