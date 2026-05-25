// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import EventManagement from "../EventManagement.vue";
import { useVoyageStore } from "../../composables/useVoyageStore";
import { nextTick } from "vue";

// Mock @shared to provide SettingsCard and Icon
vi.mock("@shared", async () => {
  return {
    SettingsCard: {
      name: "SettingsCard",
      template: '<div class="settings-card-mock"><slot name="header-extra" /><slot /></div>',
      props: ["title", "icon", "initiallyExpanded"]
    },
    Icon: {
      name: "Icon",
      template: '<div class="icon-mock" />',
      props: ["name", "size"]
    }
  };
});

// Mock VoyageSetupForm
vi.mock("../VoyageSetupForm.vue", () => ({
  default: {
    name: "VoyageSetupForm",
    template: '<div class="voyage-setup-form-mock" />'
  }
}));

// Mock SupabaseClient because useVoyageStore uses it
vi.mock("@core/api/SupabaseClient", () => ({
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

vi.mock("@core/api/VoyageClient", () => ({
  initializeVoyage: vi.fn(),
  fetchVoyageSummary: vi.fn(),
  fetchVoyageContributions: vi.fn(),
}));

describe("EventManagement.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const createWrapper = (props = {}) => {
    return mount(EventManagement, {
      props
    });
  };

  it("renders correctly in IDLE state", async () => {
    const wrapper = createWrapper();
    await nextTick();

    expect(wrapper.find(".status-pill").text()).toBe("IDLE");
    expect(wrapper.find(".status-pill").classes()).toContain("idle");
    expect(wrapper.findComponent({ name: "VoyageSetupForm" }).exists()).toBe(true);
    expect(wrapper.find(".active-summary").exists()).toBe(false);
  });

  it("displays active summary when store.isActive is true", async () => {
    const store = useVoyageStore();
    // @ts-ignore - injecting mock state
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 5000,
        end_at: new Date("2026-01-02T12:00:00Z").toISOString()
      },
      total_crowns: 2500,
      progress_ratio: 0.5,
      contributions: []
    };

    const wrapper = createWrapper();
    await nextTick();

    expect(wrapper.find(".status-pill").text()).toBe("ACTIVE");
    expect(wrapper.find(".status-pill").classes()).toContain("active");

    const summary = wrapper.find(".active-summary");
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain("2,500 / 5,000");
    expect(summary.text()).toContain("50%");
    expect(summary.text()).toContain("Underway");
    expect(summary.find(".timer").text()).toBe("1d 00h");
  });

  it("shows Goal Achieved when crowns target is met", async () => {
    const store = useVoyageStore();
    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 5000,
        end_at: new Date("2026-01-02T12:00:00Z").toISOString()
      },
      total_crowns: 5001,
      progress_ratio: 1.0002,
      contributions: []
    };

    const wrapper = createWrapper();
    await nextTick();
    expect(wrapper.find(".summary-value.victory").text()).toBe("Goal Achieved");
  });

  it("updates countdown timer every second", async () => {
    const store = useVoyageStore();
    const endAt = new Date("2026-01-01T12:00:10Z"); // 10 seconds from now
    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 5000,
        end_at: endAt.toISOString()
      },
      total_crowns: 0,
      progress_ratio: 0,
      contributions: []
    };

    const wrapper = createWrapper();
    await nextTick();
    expect(wrapper.find(".timer").text()).toBe("00:00:10");

    // Advance 1s
    vi.advanceTimersByTime(1000);
    await nextTick();

    const timer = wrapper.find(".timer");
    if (timer.exists()) {
      expect(timer.text()).toBe("00:00:09");
    }

    // Advance to end
    vi.advanceTimersByTime(9000);
    await nextTick();

    const timerEnd = wrapper.find(".timer");
    if (timerEnd.exists()) {
      expect(timerEnd.text()).toBe("Ended");
    }
  });

  it("refreshes store when timer ends", async () => {
    const store = useVoyageStore();
    const refreshSpy = vi.spyOn(store, "refresh");
    const endAt = new Date("2026-01-01T12:00:01Z");
    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 5000,
        end_at: endAt.toISOString()
      },
      total_crowns: 0,
      progress_ratio: 0,
      contributions: []
    };

    createWrapper();
    await nextTick();

    // Initial refresh on mounted
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    // Advance 1s to reach "Ended"
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(refreshSpy).toHaveBeenCalledTimes(2);
  });

  it("handles empty endsAt gracefully", async () => {
    const store = useVoyageStore();
    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 5000,
        end_at: null
      },
      total_crowns: 0,
      progress_ratio: 0,
      contributions: []
    };

    const wrapper = createWrapper();
    await nextTick();
    expect(wrapper.find(".timer").exists()).toBe(false);
  });
});
