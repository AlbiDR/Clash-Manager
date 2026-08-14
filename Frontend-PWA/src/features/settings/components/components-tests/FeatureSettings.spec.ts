// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reactive, defineComponent, ref } from "vue";
import FeatureSettings from "../FeatureSettings.vue";
import * as useSettingsModule from "../../composables/useSettings";
import { resetNativeBridgeState } from "@core/services/useNativeBridge";

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
  props: ["label", "description", "active", "loading", "mini"],
  template: '<div class="setting-row-stub" @click="$emit(\'click\')">{{ label }} {{ description }}</div>'
});

const AndroidCalibrationSettingsStub = defineComponent({
  name: "AndroidCalibrationSettings",
  template: '<div class="android-calibration-settings-stub"></div>'
});

describe("FeatureSettings.vue", () => {
  const mockModules = reactive({
    ghostBenchmarking: false,
    sortExplanation: true,
    blitzMode: false,
    blitzSpeed: "fast",
  });
  const mockIsRefreshing = ref(false);
  const mockToggle = vi.fn();
  const mockSetBlitzSpeed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockModules.ghostBenchmarking = false;
    mockModules.sortExplanation = true;
    mockModules.blitzMode = false;
    mockModules.blitzSpeed = "fast";
    mockIsRefreshing.value = false;

    // Ensure clean window state
    resetNativeBridgeState();
    delete (window as any).AndroidBridge;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      modules: mockModules,
      toggle: mockToggle,
      isRefreshing: mockIsRefreshing,
      setBlitzSpeed: mockSetBlitzSpeed,
    } as any);
  });

  afterEach(() => {
    delete (window as any).AndroidBridge;
    vi.unstubAllGlobals();
  });

  const mountComponent = (props = {}) => {
    return mount(FeatureSettings, {
      props,
      global: {
        stubs: {
          SettingsCard: SettingsCardStub,
          SettingRow: SettingRowStub,
          AndroidCalibrationSettings: AndroidCalibrationSettingsStub
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
      vi.stubGlobal("window", {
        location: { href: "" },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      mockModules.blitzMode = false;
      const wrapper = mountComponent();

      const { handleBlitzToggle } = (wrapper.vm as any);
      handleBlitzToggle();

      expect(window.location.href).toBe(
        "intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end"
      );
    });

    it("does not redirect to accessibility settings when disabling Blitz Mode", async () => {
      const initialHref = "about:blank";
      vi.stubGlobal("window", {
        location: { href: initialHref },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      mockModules.blitzMode = true; // Already enabled - clicking toggles it OFF
      const wrapper = mountComponent();

      const { handleBlitzToggle } = (wrapper.vm as any);
      handleBlitzToggle();

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
});
