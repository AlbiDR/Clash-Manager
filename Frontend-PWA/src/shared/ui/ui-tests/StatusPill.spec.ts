// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import StatusPill from "../StatusPill.vue";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

const { tapMock } = vi.hoisted(() => ({
  tapMock: vi.fn(),
}));

vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: tapMock,
    warning: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("StatusPill", () => {
  it("renders correctly for each valid type", async () => {
    const types = ["success", "warning", "error", "loading"] as const;
    for (const type of types) {
      const wrapper = mount(StatusPill, {
        props: { type, text: `Status ${type}`, nominal: false },
      });
      
      // Every type renders the caller's own `text`, loading included.
      expect(wrapper.text()).toContain(`Status ${type}`);
      expect(wrapper.classes()).toContain(`is-${type}`);
      expect(wrapper.find(".status-trigger").exists()).toBe(true);
      
      if (type === "loading") {
        expect(wrapper.find(".spinner").exists()).toBe(true);
      } else {
        expect(wrapper.find(".status-dot").exists()).toBe(true);
      }
    }
  });

  it("opens details without changing the trigger's document-flow footprint", async () => {
    const wrapper = mount(StatusPill, {
      props: {
        type: "success",
        text: "Ready",
        nominal: true,
        remoteInfo: { source: "SUPABASE", dataAge: "2m ago" },
      },
      global: {
        directives: {
          tactile: {
            mounted(el) {
              el.addEventListener("pointerdown", () => {});
              el.addEventListener("pointerup", () => tapMock());
            }
          }
        }
      }
    });
    
    const trigger = wrapper.find(".status-trigger");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".status-details").exists()).toBe(false);
    
    // Simulate v-tactile interaction
    await trigger.trigger("pointerdown");
    await trigger.trigger("pointerup");
    await trigger.trigger("click");
    
    expect(wrapper.classes()).toContain("is-expanded");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".status-details").exists()).toBe(true);
    expect(tapMock).toHaveBeenCalled();

    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".status-details").exists()).toBe(false);
  });

  it("keeps an error compact until its details are explicitly requested", async () => {
    const wrapper = mount(StatusPill, {
      props: {
        type: "error",
        text: "Sync failed",
        remoteInfo: {
          source: "SUPABASE",
          dataAge: null,
          diagnosis: "The connection timed out before the latest roster could be fetched.",
        },
      },
    });

    const trigger = wrapper.find(".status-trigger");
    expect(wrapper.find(".status-details").exists()).toBe(false);
    expect(trigger.attributes("aria-expanded")).toBe("false");

    await trigger.trigger("click");

    expect(wrapper.find(".status-details").exists()).toBe(true);
    expect(wrapper.find(".is-diagnosis dd").text()).toContain("timed out");
  });

  it("shows label automatically when loading even if nominal", () => {
    const wrapper = mount(StatusPill, {
      props: { type: "loading", text: "Loading", nominal: true },
    });
    expect(wrapper.find(".status-label").exists()).toBe(true);
    expect(wrapper.text()).toContain("Loading");
  });

  it("lets an in-progress refresh disclose the data already on screen", async () => {
    const wrapper = mount(StatusPill, {
      props: {
        type: "loading",
        text: "SYNCING",
        remoteInfo: { source: "SUPABASE", dataAge: "4m ago", lastFetched: "Just now" },
      },
    });

    const trigger = wrapper.find(".status-trigger");
    expect(trigger.attributes("aria-expanded")).toBe("false");

    await trigger.trigger("click");

    expect(wrapper.find(".status-details").text()).toContain("Checking for updates");
    expect(wrapper.find(".status-details").text()).toContain("Source snapshot");
    expect(wrapper.find(".status-details").text()).toContain("Last checked");
  });

  it("speaks the caller's loading label rather than a hardcoded one", () => {
    // Laboratory authors "Scanning Vault..." and "Computing Trajectory...", and
    // Settings distinguishes "Connecting..." from "Syncing...". All four were
    // discarded while this branch rendered a literal.
    const wrapper = mount(StatusPill, {
      props: { type: "loading", text: "Scanning Vault...", nominal: false },
    });
    expect(wrapper.find(".status-label").text()).toBe("Scanning Vault...");
  });

  it("displays SUPABASE source when remoteInfo.source is SUPABASE", async () => {
    const wrapper = mount(StatusPill, {
      props: { 
        type: "success", 
        text: "DB", 
        remoteInfo: { source: "SUPABASE", dataAge: "10m ago" } 
      },
    });
    
    // Expand
    await wrapper.find(".status-trigger").trigger("click");
    
    expect(wrapper.text()).toContain("DB");
    expect(wrapper.text()).toContain("10m ago");
  });

  it("keeps a complete accessible status name when its visual text is condensed", () => {
    const wrapper = mount(StatusPill, {
      props: { type: "success", text: "DB", nominal: true },
    });

    expect(wrapper.find(".status-trigger").attributes("aria-label")).toBe("DB");
    expect(wrapper.find(".status-indicator").exists()).toBe(true);
    expect(wrapper.find(".status-label").text()).toBe("DB");
  });
});
