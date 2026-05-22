// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VoyageSetupForm from "../VoyageSetupForm.vue";
import { useVoyageStore } from "../../composables/useVoyageStore";

// Mock @shared to provide Icon and use real DurationInput
vi.mock("@shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    Icon: {
      name: "Icon",
      template: '<div class="icon-mock" />',
      props: ["name", "size"]
    }
  };
});

// Mock SupabaseClient because useVoyageStore uses it
vi.mock("@core/api/SupabaseClient", () => ({
  initializeVoyage: vi.fn(),
  fetchVoyageSummary: vi.fn(),
  fetchVoyageContributions: vi.fn(),
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

describe("VoyageSetupForm.vue", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Suppress onUnmounted warning for store initialization outside components
    vi.spyOn(console, 'warn').mockImplementation((msg) => {
      if (msg.includes('onUnmounted')) return;
      console.log(msg);
    });
  });

  const createWrapper = () => {
    return mount(VoyageSetupForm);
  };

  it("renders correctly with initial state", () => {
    const wrapper = createWrapper();
    const targetInput = wrapper.find("#voyage-target") as any;
    expect(targetInput.element.value).toBe("1600");

    // Default Starts In: 0:0:0
    const startsInInputs = wrapper.findAll(".t2t-group").at(0)?.findAll("input");
    expect(startsInInputs?.at(0)?.element.value).toBe("0");
    expect(startsInInputs?.at(1)?.element.value).toBe("0");
    expect(startsInInputs?.at(2)?.element.value).toBe("0");

    // Default Ends In: 1:0:0
    const endsInInputs = wrapper.findAll(".t2t-group").at(1)?.findAll("input");
    expect(endsInInputs?.at(0)?.element.value).toBe("1");
    expect(endsInInputs?.at(1)?.element.value).toBe("0");
    expect(endsInInputs?.at(2)?.element.value).toBe("0");
  });

  it("clamps crown target input between 0 and 9999", async () => {
    const wrapper = createWrapper();
    const targetInput = wrapper.find("#voyage-target");

    await targetInput.setValue(10000);
    expect((targetInput.element as HTMLInputElement).value).toBe("9999");

    // Note: The app code has a bug where it doesn't visual-clamp negative values to 0
    // because sanitize() returns 0 for negative, but clampField doesn't update the
    // field if sanitized is 0.
    // However, onTargetInput has its own logic that SHOULD work.
    await targetInput.setValue(-5);
    expect((targetInput.element as HTMLInputElement).value).toBe("0");
  });

  it("clamps startsIn days to max value (7)", async () => {
    const wrapper = createWrapper();
    const daysInput = wrapper.findAll(".t2t-group").at(0)?.find("input");

    await daysInput?.setValue(10);
    expect((daysInput?.element as HTMLInputElement).value).toBe("7");
  });

  it("shows validation hint if target crowns is 0", async () => {
    const wrapper = createWrapper();
    const targetInput = wrapper.find("#voyage-target");

    await targetInput.setValue(0);
    expect(wrapper.find(".validation-hint").text()).toBe("Set a crown target above 0.");
    expect(wrapper.find(".activate-btn").classes()).toContain("disabled");
  });

  it("shows validation hint if Ends In is not after Starts In", async () => {
    const wrapper = createWrapper();
    const startsInInputs = wrapper.findAll(".t2t-group").at(0)?.findAll("input");

    // Set Starts In to 2 days
    await startsInInputs?.at(0)?.setValue(2);
    // Ends In is still 1 day (default)

    expect(wrapper.find(".validation-hint").text()).toBe("'Ends In' must be after 'Starts In'.");
    expect(wrapper.find(".activate-btn").classes()).toContain("disabled");
  });

  it("calls store.activateVoyage with correct values when clicking activate", async () => {
    const wrapper = createWrapper();
    const store = useVoyageStore();
    const activateSpy = vi.spyOn(store, "activateVoyage").mockResolvedValue(undefined as any);

    await wrapper.find(".activate-btn").trigger("click");

    expect(activateSpy).toHaveBeenCalledWith(
      1600,
      { days: 0, hours: 0, minutes: 0 },
      { days: 1, hours: 0, minutes: 0 }
    );
  });

  it("hides Starts In section when voyage is active", async () => {
    const store = useVoyageStore();
    // @ts-ignore
    store.summary = {
      event: { status: "ACTIVE", target_crowns: 1000 }
    };

    const wrapper = createWrapper();

    // Should only have one .t2t-group (Ends In)
    expect(wrapper.findAll(".t2t-group")).toHaveLength(1);
    expect(wrapper.find(".activate-btn").text()).toBe("Update Event");
  });

  it("reflects loading state on button", async () => {
    const store = useVoyageStore();
    store.loading = true;

    const wrapper = createWrapper();

    expect(wrapper.find(".activate-btn").classes()).toContain("loading");
    expect(wrapper.find(".activate-btn").text()).toBe("Activating...");
  });

  it("updates form when store.isActive becomes true", async () => {
    const wrapper = createWrapper();
    const store = useVoyageStore();

    // Simulate store update
    // @ts-ignore
    store.summary = {
      event: {
        status: "ACTIVE",
        target_crowns: 2500,
        end_at: new Date(Date.now() + 2 * 86400000 + 3 * 3600000).toISOString()
      }
    };

    // Wait for watchers
    await wrapper.vm.$nextTick();
    // Advance timers to trigger any async behavior if needed,
    // although watchers here are mostly synchronous in their effect on refs.
    vi.advanceTimersByTime(100);

    expect((wrapper.find("#voyage-target").element as HTMLInputElement).value).toBe("2500");

    const endsInInputs = wrapper.find(".t2t-group").findAll("input");
    expect(endsInInputs.at(0)?.element.value).toBe("2");
    expect(endsInInputs.at(1)?.element.value).toBe("3");
  });
});
