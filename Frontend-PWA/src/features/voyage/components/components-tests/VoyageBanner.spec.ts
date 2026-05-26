// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VoyageBanner from "../VoyageBanner.vue";
import { useVoyageStore } from "../../composables/useVoyageStore";

// Mock @shared to avoid importing complex UI components
vi.mock("@shared", () => ({
  Icon: {
    template: '<span class="mock-icon" :data-name="name"></span>',
    props: ["name", "size"]
  }
}));

// Mock API clients used by the store to avoid side effects
vi.mock("@core/api/VoyageClient", () => ({
  fetchVoyageSummary: vi.fn(),
  fetchVoyageContributions: vi.fn()
}));

vi.mock("@core/api/SupabaseClient", () => ({
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

describe("VoyageBanner.vue", () => {
  let wrapper: any;
  let store: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    setActivePinia(createPinia());
    store = useVoyageStore();
    vi.spyOn(store, "refresh");

    wrapper = mount(VoyageBanner, {
      global: {
        plugins: []
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    wrapper.unmount();
    vi.clearAllMocks();
  });

  it("should not render when not active", async () => {
    // @ts-ignore - manual state injection for test
    store.summary = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".voyage-banner").exists()).toBe(false);
  });

  it("should render when active", async () => {
    // @ts-ignore
    store.summary = {
      event: { status: "ACTIVE", target_crowns: 1000 },
      total_crowns: 500,
      progress_ratio: 0.5
    };

    await wrapper.vm.$nextTick();

    expect(wrapper.find(".voyage-banner").exists()).toBe(true);
    expect(wrapper.find(".voyage-banner").classes()).not.toContain("is-victory");
    expect(wrapper.find(".crown-value").text()).toBe("500");
    expect(wrapper.find(".crown-target").text()).toBe("1,000");
    expect(wrapper.find(".progress-label").text()).toBe("50%");
  });

  it("should render victory state when achieved", async () => {
    // @ts-ignore
    store.summary = {
      event: { status: "ACTIVE", target_crowns: 1000 },
      total_crowns: 1000,
      progress_ratio: 1.0
    };

    await wrapper.vm.$nextTick();

    expect(wrapper.find(".voyage-banner").classes()).toContain("is-victory");
    expect(wrapper.find(".victory-label").text()).toBe("Goal Achieved");
    expect(wrapper.find('.mock-icon[data-name="victory"]').exists()).toBe(true);
  });

  it("should display live countdown and refresh when ended", async () => {
    // Set endsAt to 5 seconds in the future (12:00:05)
    const futureDate = new Date("2026-01-01T12:00:05Z");

    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 1000,
        end_at: futureDate.toISOString()
      },
      total_crowns: 0,
      progress_ratio: 0
    };

    await wrapper.vm.$nextTick();

    // Initial countdown (00:00:05)
    expect(wrapper.find(".countdown").text()).toBe("00:00:05");

    // Advance time by 5 seconds
    vi.advanceTimersByTime(5000);
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".countdown").text()).toBe("Ended");
    expect(wrapper.find(".countdown").classes()).toContain("ended");

    // Verify store.refresh was called when it ended (once on mount, once on end)
    expect(store.refresh).toHaveBeenCalledTimes(2);
  });

  it("should update countdown when endsAt changes", async () => {
    // @ts-ignore
    store.summary = {
      event: { status: "ACTIVE", target_crowns: 1000, end_at: null },
      total_crowns: 0,
      progress_ratio: 0
    };
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".countdown").text()).toBe("");

    const futureDate = new Date("2026-01-01T13:00:00Z"); // 1 hour from 12:00:00
    // @ts-ignore
    store.summary.event.end_at = futureDate.toISOString();
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".countdown").text()).toBe("01:00:00");
  });
});
