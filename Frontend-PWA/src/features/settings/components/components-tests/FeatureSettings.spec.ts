// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reactive, defineComponent, ref } from "vue";
import FeatureSettings from "../FeatureSettings.vue";
import * as useSettingsModule from "../../composables/useSettings";

// Deep import mock per ADR to avoid barrel side effects
vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

// Functional stubs to allow prop inspection
const SettingsCardStub = defineComponent({
  name: "SettingsCard",
  props: ["title", "icon", "loading", "initiallyExpanded"],
  template: '<div class="settings-card-stub"><slot /></div>'
});

const SettingRowStub = defineComponent({
  name: "SettingRow",
  props: ["label", "description", "active", "loading"],
  template: '<div class="setting-row-stub" @click="$emit(\'click\')"></div>'
});

describe("FeatureSettings.vue", () => {
  const mockModules = reactive({
    ghostBenchmarking: false,
    sortExplanation: true,
    blitzMode: false
  });
  const mockIsRefreshing = ref(false);
  const mockToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockModules.ghostBenchmarking = false;
    mockModules.sortExplanation = true;
    mockModules.blitzMode = false;
    mockIsRefreshing.value = false;

    // Ensure clean window state
    delete (window as any).AndroidBridge;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      modules: mockModules,
      toggle: mockToggle,
      isRefreshing: mockIsRefreshing
    } as any);
  });

  afterEach(() => {
    delete (window as any).AndroidBridge;
  });

  const mountComponent = (props = {}) => {
    return mount(FeatureSettings, {
      props,
      global: {
        stubs: {
          SettingsCard: SettingsCardStub,
          SettingRow: SettingRowStub
        }
      }
    });
  };

  it("renders the settings card with correct props", () => {
    const wrapper = mountComponent({ initiallyExpanded: true });
    const card = wrapper.findComponent(SettingsCardStub);

    expect(card.exists()).toBe(true);
    expect(card.props("title")).toBe("Application Features");
    expect(card.props("icon")).toBe("analytics");
    expect(card.props("initiallyExpanded")).toBe(true);
  });

  it("renders all feature setting rows", () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    expect(rows).toHaveLength(3);
    expect(rows[0].props("label")).toBe("Ghost Benchmarking");
    expect(rows[1].props("label")).toBe("Sorting Descriptions");
    expect(rows[2].props("label")).toBe("Blitz Mode");
  });

  it("synchronizes row active state with modules", () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    expect(rows[0].props("active")).toBe(false); // ghostBenchmarking
    expect(rows[1].props("active")).toBe(true);  // sortExplanation
    expect(rows[2].props("active")).toBe(false); // blitzMode
  });

  it("calls toggle with correct module name when feature rows are clicked", async () => {
    const wrapper = mountComponent();
    const rows = wrapper.findAllComponents(SettingRowStub);

    await rows[0].trigger("click");
    expect(mockToggle).toHaveBeenCalledWith("ghostBenchmarking");

    await rows[1].trigger("click");
    expect(mockToggle).toHaveBeenCalledWith("sortExplanation");
  });

  describe("Blitz Mode toggle (PWA mode)", () => {
    it("calls toggle('blitzMode') when clicked in PWA mode", async () => {
      const wrapper = mountComponent();
      const blitzRow = wrapper.findAllComponents(SettingRowStub)[2];

      await blitzRow.trigger("click");
      expect(mockToggle).toHaveBeenCalledWith("blitzMode");
    });

    it("opens accessibility settings via intent:// fallback when enabling Blitz Mode in PWA mode", async () => {
      Object.defineProperty(window, "location", {
        writable: true,
        value: { href: "" },
      });

      mockModules.blitzMode = false;
      const wrapper = mountComponent();
      const blitzRow = wrapper.findAllComponents(SettingRowStub)[2];

      await blitzRow.trigger("click");

      expect(window.location.href).toBe(
        "intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end"
      );
    });

    it("does not redirect to accessibility settings when disabling Blitz Mode", async () => {
      const initialHref = "about:blank";
      Object.defineProperty(window, "location", {
        writable: true,
        value: { href: initialHref },
      });

      mockModules.blitzMode = true; // Already enabled - clicking toggles it OFF
      const wrapper = mountComponent();
      const blitzRow = wrapper.findAllComponents(SettingRowStub)[2];

      await blitzRow.trigger("click");

      // href must remain unchanged - no redirect when disabling
      expect(window.location.href).toBe(initialHref);
    });
  });

  it("passes isRefreshing state to card and rows", async () => {
    const wrapper = mountComponent();

    mockIsRefreshing.value = true;
    await wrapper.vm.$nextTick();

    const card = wrapper.findComponent(SettingsCardStub);
    expect(card.props("loading")).toBe(true);

    const rows = wrapper.findAllComponents(SettingRowStub);
    expect(rows[0].props("loading")).toBe(true);
    expect(rows[1].props("loading")).toBe(true);
    expect(rows[2].props("loading")).toBe(true);
  });

  describe("Android permissions panel (native wrapper)", () => {
    const mockBridge = {
      isAccessibilityActive: vi.fn(() => false),
      hasOverlayPermission: vi.fn(() => false),
      openAccessibilitySettings: vi.fn(),
      getCoordinates: vi.fn(() => '{"inviteX":0.5083,"inviteY":0.7214,"closeX":0.9213,"closeY":0.2044}'),
      saveCoordinates: vi.fn(),
      startBlitz: vi.fn(),
      openExternalUrl: vi.fn(),
      openPlayerProfile: vi.fn(),
    };

    beforeEach(() => {
      (window as any).AndroidBridge = mockBridge;
      vi.clearAllMocks();
      mockBridge.isAccessibilityActive.mockReturnValue(false);
      mockBridge.hasOverlayPermission.mockReturnValue(false);
      mockBridge.getCoordinates.mockReturnValue('{"inviteX":0.5083,"inviteY":0.7214,"closeX":0.9213,"closeY":0.2044}');
      vi.mocked(useSettingsModule.useSettings).mockReturnValue({
        modules: mockModules,
        toggle: mockToggle,
        isRefreshing: mockIsRefreshing
      } as any);
    });

    it("renders the permissions panel when in native wrapper", () => {
      const wrapper = mountComponent();
      expect(wrapper.find(".permissions-section").exists()).toBe(true);
    });

    it("does not render the permissions panel in PWA mode", () => {
      delete (window as any).AndroidBridge;
      const wrapper = mountComponent();
      expect(wrapper.find(".permissions-section").exists()).toBe(false);
    });

    it("shows 'Not allowed' when both permissions are denied", async () => {
      mockBridge.isAccessibilityActive.mockReturnValue(false);
      mockBridge.hasOverlayPermission.mockReturnValue(false);
      const wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const statusLabels = wrapper.findAll(".permission-status");
      expect(statusLabels[0].text()).toBe("Not allowed");
      expect(statusLabels[1].text()).toBe("Not allowed");
    });

    it("shows 'Allowed' for both permissions when both are granted", async () => {
      mockBridge.isAccessibilityActive.mockReturnValue(true);
      mockBridge.hasOverlayPermission.mockReturnValue(true);
      const wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const statusLabels = wrapper.findAll(".permission-status");
      expect(statusLabels[0].text()).toBe("Allowed");
      expect(statusLabels[1].text()).toBe("Allowed");
    });

    it("calls openAccessibilitySettings when the accessibility row is clicked", async () => {
      const wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const rows = wrapper.findAll(".permission-row");
      await rows[0].trigger("click");

      expect(mockBridge.openAccessibilitySettings).toHaveBeenCalledOnce();
    });

    it("navigates to overlay settings intent when the overlay row is clicked", async () => {
      Object.defineProperty(window, "location", {
        writable: true,
        value: { href: "" },
      });
      const wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      const rows = wrapper.findAll(".permission-row");
      await rows[1].trigger("click");

      expect(window.location.href).toContain("MANAGE_OVERLAY_PERMISSION");
      expect(window.location.href).toContain("com.albidr.clashmanager");
    });

    it("re-polls permissions on window focus", async () => {
      mockBridge.isAccessibilityActive.mockReturnValue(false);
      mockBridge.hasOverlayPermission.mockReturnValue(false);
      const wrapper = mountComponent();
      await wrapper.vm.$nextTick();

      // Simulate user returning from settings with permissions now granted
      mockBridge.isAccessibilityActive.mockReturnValue(true);
      mockBridge.hasOverlayPermission.mockReturnValue(true);
      window.dispatchEvent(new Event("focus"));
      await wrapper.vm.$nextTick();

      const statusLabels = wrapper.findAll(".permission-status");
      expect(statusLabels[0].text()).toBe("Allowed");
      expect(statusLabels[1].text()).toBe("Allowed");
    });
  });
});
