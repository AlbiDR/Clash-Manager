// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import EventManagement from "../EventManagement.vue";
import * as VoyageStore from "../../composables/useVoyageStore";
import { nextTick, defineComponent, reactive } from "vue";

// Mock @shared selectively
vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  const { defineComponent } = await import("vue");
  return {
    ...actual,
    SettingsCard: defineComponent({
      name: "SettingsCard",
      props: ["title", "icon", "initiallyExpanded"],
      template: '<div class="settings-card-mock"><slot name="header-extra" /><slot /></div>'
    }),
    Icon: defineComponent({
      name: "Icon",
      props: ["name", "size"],
      template: '<div class="icon-mock" :data-name="name" />'
    })
  };
});

// Mock the store directly
vi.mock("../../composables/useVoyageStore", () => ({
  useVoyageStore: vi.fn()
}));

describe("EventManagement.vue", () => {
  let store: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    store = reactive({
      summary: null,
      status: "IDLE",
      isActive: false,
      isPending: false,
      isAwaitingEnd: false,
      targetCrowns: 5000,
      totalCrowns: 0,
      progressRatio: 0,
      isVictory: false,
      loading: false,
      refresh: vi.fn(),
      endsAt: null,
      startsAt: null
    });
    vi.mocked(VoyageStore.useVoyageStore).mockReturnValue(store);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const createWrapper = (props = {}) => {
    return mount(EventManagement, {
      props,
      global: {
        stubs: {
          VoyageSetupForm: true
        }
      }
    });
  };

  it("renders correctly in IDLE state", async () => {
    const wrapper = createWrapper();
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".status-pill").text()).toBe("IDLE");
  });

  it("displays active summary when store.isActive is true", async () => {
    store.isActive = true;
    store.status = "ACTIVE";
    store.totalCrowns = 2500;
    store.targetCrowns = 5000;
    store.progressRatio = 0.5;
    store.endsAt = new Date("2026-01-02T12:00:00Z");

    const wrapper = createWrapper();
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".status-pill").text()).toBe("ACTIVE");
    expect(wrapper.find(".active-summary").exists()).toBe(true);
    expect(wrapper.find(".timer").text()).toBe("1d 00h");
  });

  it("updates countdown timer every second", async () => {
    store.isActive = true;
    store.status = "ACTIVE";
    store.endsAt = new Date("2026-01-01T12:00:10Z");

    const wrapper = createWrapper();
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".timer").text()).toBe("00:00:10");

    vi.advanceTimersByTime(1000);
    await nextTick();
    await flushPromises();

    expect(wrapper.find(".timer").text()).toBe("00:00:09");
  });
});
