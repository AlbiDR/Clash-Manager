// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount } from "@vue/test-utils";
import NavigationDock from "../NavigationDock.vue";
import { useRoute, useRouter } from "vue-router";
import * as hapticsModule from "@shared/composables/useHaptics";
import { NAV_ITEMS } from "../../../core/utils/navigation";

// Mock vue-router
vi.mock("vue-router", () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

// Mock useHaptics
vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: vi.fn(() => ({
    tap: vi.fn(),
  })),
}));

describe("NavigationDock.vue", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
  });

  it("renders all navigation items", () => {
    vi.mocked(useRoute).mockReturnValue({ path: "/roster" } as any);
    const wrapper = shallowMount(NavigationDock);

    const buttons = wrapper.findAll(".dock-item");
    expect(buttons.length).toBe(NAV_ITEMS.length);

    NAV_ITEMS.forEach((item, index) => {
      expect(buttons[index].attributes("aria-label")).toBe(item.label);
    });
  });

  it("applies active class to the item matching current route", () => {
    vi.mocked(useRoute).mockReturnValue({ path: "/laboratory" } as any);
    const wrapper = shallowMount(NavigationDock);

    const activeItem = wrapper.find(".dock-item.active");
    expect(activeItem.exists()).toBe(true);
    expect(activeItem.attributes("aria-label")).toBe("Laboratory");
    expect(wrapper.find(".capsule-bg").exists()).toBe(true);
  });

  it("calls router.push when a different route is clicked", async () => {
    vi.mocked(useRoute).mockReturnValue({ path: "/roster" } as any);
    const wrapper = shallowMount(NavigationDock);

    // Find the headhunter item (index 1)
    const headhunterBtn = wrapper.findAll(".dock-item")[1];
    await headhunterBtn.trigger("click");

    expect(mockPush).toHaveBeenCalledWith("/headhunter");
  });

  it("retargets additional route taps while navigation is pending", async () => {
    let resolveFirstNavigation!: () => void;
    let resolveSecondNavigation!: () => void;
    mockPush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirstNavigation = resolve;
      }),
    );
    mockPush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSecondNavigation = resolve;
      }),
    );
    vi.mocked(useRoute).mockReturnValue({ path: "/roster" } as any);
    const wrapper = shallowMount(NavigationDock);
    const buttons = wrapper.findAll(".dock-item");

    buttons[1].trigger("click");
    await wrapper.vm.$nextTick();
    expect(buttons[1].classes()).toContain("active");
    expect(buttons[1].attributes("aria-busy")).toBe("true");

    buttons[2].trigger("click");
    await wrapper.vm.$nextTick();

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith("/headhunter");
    expect(mockPush).toHaveBeenCalledWith("/laboratory");
    expect(buttons[2].classes()).toContain("active");
    expect(buttons[2].attributes("disabled")).toBeUndefined();

    resolveFirstNavigation();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(buttons[2].classes()).toContain("active");

    resolveSecondNavigation();
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".dock-item").attributes("disabled")).toBeUndefined();
  });

  it("does not call router.push when the active route is clicked", async () => {
    vi.mocked(useRoute).mockReturnValue({ path: "/roster" } as any);
    const wrapper = shallowMount(NavigationDock);

    const rosterBtn = wrapper.findAll(".dock-item")[0];
    await rosterBtn.trigger("click");

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("triggers haptic tap on pointerdown", async () => {
    const tapSpy = vi.fn();
    vi.mocked(hapticsModule.useHaptics).mockReturnValue({
      tap: tapSpy,
    } as any);

    vi.mocked(useRoute).mockReturnValue({ path: "/roster" } as any);
    const wrapper = shallowMount(NavigationDock);

    await wrapper.find(".dock-item").trigger("pointerdown");

    expect(tapSpy).toHaveBeenCalled();
  });
});
