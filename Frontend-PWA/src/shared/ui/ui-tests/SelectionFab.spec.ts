// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import SelectionFab from "../SelectionFab.vue";
import { reactive } from "vue";

// Mock haptics
const mockTap = vi.fn();
vi.mock("@shared/composables/useHaptics", () => ({
  useHaptics: () => ({
    tap: mockTap
  })
}));

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
  });

  const mountFab = () => {
    return mount(SelectionFab, {
      global: {
        stubs: {
          Icon: true
        }
      }
    });
  };

  describe("Dismiss / Abort Button", () => {
    it("renders 'Clear' label when no selection and nothing active", () => {
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.danger");
      expect(dismissBtn.text()).toContain("Clear");
      expect(dismissBtn.classes()).not.toContain("compact");
    });

    it("renders as compact when items are selected", async () => {
      fabState.selectionCount = 3;
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.danger");
      expect(dismissBtn.text()).not.toContain("Clear");
      expect(dismissBtn.classes()).toContain("compact");
    });

    it("calls onDismiss when clicked in normal mode", async () => {
      const wrapper = mountFab();
      await wrapper.find(".fab-btn.danger").trigger("click");
      expect(fabState.onDismiss).toHaveBeenCalled();
    });

    it("calls onAbortHarvest when clicked while harvesting", async () => {
      fabState.isHarvesting = true;
      const wrapper = mountFab();
      const dismissBtn = wrapper.find(".fab-btn.danger");
      expect(dismissBtn.attributes("aria-label")).toBe("Abort Harvest");

      await dismissBtn.trigger("click");
      expect(fabState.onAbortHarvest).toHaveBeenCalled();
      expect(fabState.onDismiss).not.toHaveBeenCalled();
    });

    it("triggers haptic tap on pointerdown", async () => {
      const wrapper = mountFab();
      await wrapper.find(".fab-btn.danger").trigger("pointerdown");
      expect(mockTap).toHaveBeenCalled();
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

  describe("Blitz Mode (Enabled)", () => {
    beforeEach(() => {
      fabState.blitzEnabled = true;
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
