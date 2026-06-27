// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VoyageSetupForm from "../VoyageSetupForm.vue";
import * as VoyageStore from "../../composables/useVoyageStore";
import { reactive } from "vue";

// Mock the store directly
vi.mock("../../composables/useVoyageStore", () => ({
  useVoyageStore: vi.fn()
}));

vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  const { defineComponent } = await import("vue");
  return {
    ...actual,
    Icon: defineComponent({
      name: "Icon",
      props: ["name", "size"],
      template: '<div class="icon-mock" />'
    }),
    DurationInput: defineComponent({
      name: "DurationInput",
      props: ["modelValue", "label"],
      template: '<div class="duration-input-mock">{{label}}</div>'
    })
  };
});

describe("VoyageSetupForm.vue", () => {
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
      loading: false,
      activateVoyage: vi.fn(),
      setVoyageEnd: vi.fn(),
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

  it("renders correctly with initial state", () => {
    const wrapper = mount(VoyageSetupForm);
    expect(wrapper.find(".target-input").exists()).toBe(true);
  });

  it("shows validation hint if Ends In is not after Starts In", async () => {
      const wrapper = mount(VoyageSetupForm);
      await wrapper.vm.$nextTick();

      // Ends In (1h) <= Starts In (2h)
      // This should trigger the "'Ends In' must be after 'Starts In'." hint
      wrapper.vm.targetCrowns = 1000;
      wrapper.vm.startsIn = { days: 0, hours: 2, minutes: 0 };
      wrapper.vm.endsIn = { days: 0, hours: 1, minutes: 0 };
      await wrapper.vm.$nextTick();

      expect(wrapper.find(".validation-hint").exists()).toBe(true);
      expect(wrapper.find(".validation-hint").text()).toContain("after");
  });

  it("calls store.setVoyageEnd when Set End Time button is clicked", async () => {
    store.isAwaitingEnd = true;
    store.isActive = true;
    store.status = "ACTIVE";
    store.summary = { event: { id: 1, status: "ACTIVE", end_at: null, target_crowns: 1000 } };

    const wrapper = mount(VoyageSetupForm);
    await wrapper.vm.$nextTick();

    wrapper.vm.endsIn = { days: 1, hours: 0, minutes: 0 };
    await wrapper.vm.$nextTick();

    const btn = wrapper.find("#voyage-set-end-btn");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(store.setVoyageEnd).toHaveBeenCalled();
  });
});
