// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SelectionFab from "../SelectionFab.vue";
import { reactive } from "vue";

// Mock UI Coordinator
const fabState = reactive({
  label: "Open",
  actionHref: undefined,
  isProcessing: false,
  isBlasting: false,
  isHarvesting: false,
  activeHarvester: null,
  selectionCount: 0,
  blitzEnabled: false,
  harvestEnabled: false,
  dismissLabel: "Clear selection",
  onAction: vi.fn(),
  onBlitz: vi.fn(),
  onDismiss: vi.fn(),
  onGlobalHarvest: vi.fn(),
  onLocalHarvest: vi.fn(),
  onAbortHarvest: vi.fn(),
});

vi.mock("@core/services/useUiCoordinator", () => ({
  useUiCoordinator: () => ({
    fabState
  })
}));

describe("SelectionFab.vue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fabState to defaults
    fabState.label = "Open";
    fabState.isBlasting = false;
    fabState.isHarvesting = false;
    fabState.activeHarvester = null;
    fabState.selectionCount = 0;
    fabState.blitzEnabled = false;
    fabState.harvestEnabled = false;
    fabState.dismissLabel = "Clear selection";
  });

  const mountFab = () => {
    return mount(SelectionFab, {
      global: {
        stubs: {
          Icon: true
        },
        directives: {
          tactile: {
            beforeMount() {}
          }
        }
      }
    });
  };

  describe("Dismiss / Abort Button", () => {
    it("renders 'Clear' label when no selection and nothing active", () => {
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.dismiss");
      expect(dismissBtn.text()).toContain("Clear");
      expect(dismissBtn.classes()).not.toContain("compact");
      expect(dismissBtn.classes()).not.toContain("danger");
      expect(wrapper.find(".selection-summary").text()).toBe("Choose entries to begin");
    });

    it("renders as compact when items are selected", async () => {
      fabState.selectionCount = 3;
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.dismiss");
      expect(dismissBtn.text()).not.toContain("Clear");
      expect(dismissBtn.classes()).toContain("compact");
      expect(dismissBtn.classes()).not.toContain("danger");
      expect(dismissBtn.attributes("aria-label")).toBe("Clear selection (3)");
      expect(wrapper.find(".selection-summary").text()).toBe("3selected");
    });

    it("uses the feature-provided name for a non-clear dismiss action", () => {
      fabState.selectionCount = 2;
      fabState.dismissLabel = "Dismiss selected recruits";
      const wrapper = mountFab();

      expect(wrapper.find(".fab-btn.dismiss").attributes("aria-label"))
        .toBe("Dismiss selected recruits (2)");
    });

    it("calls onDismiss when clicked in normal mode", async () => {
      const wrapper = mountFab();
      await wrapper.find(".fab-btn.dismiss").trigger("click");
      expect(fabState.onDismiss).toHaveBeenCalled();
    });

    it("calls onAbortHarvest when clicked while harvesting", async () => {
      fabState.isHarvesting = true;
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.dismiss");
      expect(dismissBtn.attributes("aria-label")).toBe("Abort Harvest");
      expect(dismissBtn.classes()).toContain("danger");

      await dismissBtn.trigger("click");
      expect(fabState.onAbortHarvest).toHaveBeenCalled();
      expect(fabState.onDismiss).not.toHaveBeenCalled();
    });

  });

  describe("Blasting Mode", () => {
    beforeEach(() => {
      fabState.isBlasting = true;
      fabState.label = "Next: Player1";
    });

    it("renders blasting status and next button", () => {
      const wrapper = mountFab();
      expect(wrapper.find(".blast-status").exists()).toBe(true);
      expect(wrapper.find(".blast-label").text()).toBe("Next: Player1");
      expect(wrapper.find(".fab-btn.primary.compact").exists()).toBe(true);
    });

    it("calls onAction when 'Next' button is clicked", async () => {
      const wrapper = mountFab();
      await wrapper.find(".fab-btn.primary.compact").trigger("click");
      expect(fabState.onAction).toHaveBeenCalled();
    });
  });

  describe("Blitz Mode (Enabled, Harvest Disabled — e.g. Roster)", () => {
    beforeEach(() => {
      fabState.blitzEnabled = true;
      fabState.harvestEnabled = false;
      fabState.selectionCount = 5;
    });

    it("renders Blitz but not the Harvest buttons", () => {
      // Regression guard: Harvest scouts external clanless players for
      // recruiting, which doesn't apply to views like Roster that only wire
      // up Blitz. Previously these buttons rendered unconditionally whenever
      // blitzEnabled was true and silently did nothing when clicked there.
      const wrapper = mountFab();
      expect(wrapper.find(".fab-btn.blitz").exists()).toBe(true);
      expect(wrapper.find(".fab-btn.blitz").attributes("aria-label")).toBe("Start Blitz for 5 selected");
      expect(wrapper.find(".blitz-count").text()).toBe("5");
      expect(wrapper.find("button[aria-label='Global Harvest']").exists()).toBe(false);
      expect(wrapper.find("button[aria-label='Local Harvest']").exists()).toBe(false);
    });
  });

  describe("Blitz Mode (Enabled, Harvest Enabled — e.g. Headhunter)", () => {
    beforeEach(() => {
      fabState.blitzEnabled = true;
      fabState.harvestEnabled = true;
      fabState.selectionCount = 5;
    });

    it("renders Blitz, Globe (Global), and Map-Pin (Local) buttons", () => {
      const wrapper = mountFab();
      expect(wrapper.find(".fab-btn.blitz").exists()).toBe(true);
      expect(wrapper.find("button[aria-label='Global Harvest']").exists()).toBe(true);
      expect(wrapper.find("button[aria-label='Local Harvest']").exists()).toBe(true);
    });

    it("disables Blitz button when selectionCount is 0", async () => {
      fabState.selectionCount = 0;
      const wrapper = mountFab();
      const blitzBtn = wrapper.find(".fab-btn.blitz");
      expect(blitzBtn.element.disabled).toBe(true);
      expect(blitzBtn.attributes("aria-label")).toBe("Select one or more entries to start Blitz");
    });

    it("calls relevant callbacks when buttons are clicked", async () => {
      const wrapper = mountFab();

      await wrapper.find(".fab-btn.blitz").trigger("click");
      expect(fabState.onBlitz).toHaveBeenCalled();

      await wrapper.find("button[aria-label='Global Harvest']").trigger("click");
      expect(fabState.onGlobalHarvest).toHaveBeenCalled();

      await wrapper.find("button[aria-label='Local Harvest']").trigger("click");
      expect(fabState.onLocalHarvest).toHaveBeenCalled();
    });

    it("shows loading state for active harvester", async () => {
      fabState.isHarvesting = true;
      fabState.activeHarvester = "global";
      const wrapper = mountFab();

      const globalBtn = wrapper.find("button[aria-label='Global Harvest']");
      expect(globalBtn.classes()).toContain("loading");
      expect(globalBtn.find(".spinner-small").exists()).toBe(true);

      const localBtn = wrapper.find("button[aria-label='Local Harvest']");
      expect(localBtn.classes()).not.toContain("loading");
    });
  });

  describe("Action Mode (Blitz Disabled)", () => {
    it("renders primary action button with dynamic label", () => {
      fabState.blitzEnabled = false;
      fabState.label = "Promote";
      const wrapper = mountFab();

      const actionBtn = wrapper.find(".fab-btn.primary");
      expect(actionBtn.text()).toContain("Promote");
    });

    it("calls onAction when clicked", async () => {
      const wrapper = mountFab();
      await wrapper.find(".fab-btn.primary").trigger("click");
      expect(fabState.onAction).toHaveBeenCalled();
    });
  });
});
