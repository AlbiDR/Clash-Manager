// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VoyageBanner from "../VoyageBanner.vue";
import * as VoyageStore from "../../composables/useVoyageStore";
import { reactive } from "vue";

// Mock the store directly
vi.mock("../../composables/useVoyageStore", () => ({
  useVoyageStore: vi.fn()
}));

// Mock @shared selectively for Icon
vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  const { defineComponent } = await import("vue");
  return {
    ...actual,
    Icon: defineComponent({
      name: "Icon",
      props: ["name", "size"],
      template: '<span class="mock-icon" :data-name="name"></span>'
    })
  };
});

describe("VoyageBanner.vue", () => {
  let store: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    setActivePinia(createPinia());

    store = reactive({
      summary: null,
      status: "IDLE",
      isActive: false,
      isPending: false,
      isAwaitingEnd: false,
      loading: false,
      refresh: vi.fn(),
      targetCrowns: 0,
      totalCrowns: 0,
      progressRatio: 0,
      isVictory: false,
      endsAt: null,
      startsAt: null
    });
    vi.mocked(VoyageStore.useVoyageStore).mockReturnValue(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should not render when not active", async () => {
    const wrapper = mount(VoyageBanner);
    store.isActive = false;
    store.isPending = false;
    store.isAwaitingEnd = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".voyage-banner").exists()).toBe(false);
  });

  it("should render when active", async () => {
    store.isActive = true;
    store.status = "ACTIVE";
    store.targetCrowns = 1000;
    store.totalCrowns = 500;
    store.progressRatio = 0.5;

    const wrapper = mount(VoyageBanner);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".voyage-banner").exists()).toBe(true);
    expect(wrapper.find(".crown-value").text()).toBe("500");
  });
});
