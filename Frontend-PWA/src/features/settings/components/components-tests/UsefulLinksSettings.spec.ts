// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * Useful Links Settings Component Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 3 Features (Settings Component)
 * - **Satisfaction:** ADR Section VII: Naming and Location Conventions.
 *
 * This test suite verifies correct localization resolution of URLs, conditional rendering
 * of the native Android download link inside the hybrid wrapper, and stable latest APK
 * versioned latest APK routing.
 */

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import UsefulLinksSettings from "../UsefulLinksSettings.vue";
import { ref, computed } from "vue";
import * as useSettingsModule from "../../composables/useSettings";
import * as useExternalLinkModule from "@core/services/useExternalLink";
import * as useNativeBridgeModule from "@core/services/useNativeBridge";
import * as localeModule from "@core/utils/locale";
import { resetApkResolutionCacheForTests } from "@core/services/usePwaManager";

vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

vi.mock("@core/services/useExternalLink", () => ({
  useExternalLink: vi.fn()
}));

vi.mock("@core/services/useNativeBridge", () => ({
  useNativeBridge: vi.fn()
}));

vi.mock("@core/utils/locale", () => ({
  getSupercellLocale: vi.fn()
}));

describe("UsefulLinksSettings.vue", () => {
  const mockIsRefreshing = ref(false);
  const mockOpenExternal = vi.fn();
  const mockIsNativeWrapper = ref(false);
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRefreshing.value = false;
    mockIsNativeWrapper.value = false;
    resetApkResolutionCacheForTests();

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      isRefreshing: mockIsRefreshing
    } as any);

    vi.mocked(useExternalLinkModule.useExternalLink).mockReturnValue({
      openExternal: mockOpenExternal
    } as any);

    vi.mocked(useNativeBridgeModule.useNativeBridge).mockReturnValue({
      isNativeWrapper: computed(() => mockIsNativeWrapper.value)
    } as any);

    vi.mocked(localeModule.getSupercellLocale).mockReturnValue("en");

    // Standard stub for fetch to avoid real requests
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({})
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mountComponent = () => {
    return mount(UsefulLinksSettings, {
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub"><slot /></div>'
          }
        },
        directives: {
          tactile: {}
        }
      }
    });
  };

  it("renders the links card with all specified links", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        buildNumber: 179,
        filename: "clashmanager-v14.43.4+179.apk",
        version: "14.43.4"
      })
    });

    const wrapper = mountComponent();
    await new Promise(resolve => setTimeout(resolve, 1));

    const links = wrapper.findAll("button");
    const labels = links.map(link => link.find(".link-label").text());

    expect(labels).toContain("RoyaleAPI Blog");
    expect(labels).toContain("RoyaleAPI Giveaway");
    expect(labels).toContain("Supercell ID Rewards");
    expect(labels).toContain("Clash Royale Store");
    expect(labels).toContain("Clash Manager on GitHub");
    expect(labels).toContain("Download Android App");
  });

  it("omits the Download Android App link when running in native wrapper", () => {
    mockIsNativeWrapper.value = true;
    const wrapper = mountComponent();

    const links = wrapper.findAll("button");
    const labels = links.map(link => link.find(".link-label").text());

    expect(labels).not.toContain("Download Android App");
  });

  it("triggers openExternal when clicking a link row button", async () => {
    const wrapper = mountComponent();

    const buttons = wrapper.findAll("button");
    // Let's find and click the RoyaleAPI Blog row button
    const blogBtn = buttons.find(b => b.text().includes("RoyaleAPI Blog"));
    expect(blogBtn).toBeDefined();

    await blogBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://royaleapi.com/blog");
  });

  it("updates URLs with locale code from getSupercellLocale()", () => {
    vi.mocked(localeModule.getSupercellLocale).mockReturnValue("fr");
    const wrapper = mountComponent();

    const buttons = wrapper.findAll("button");

    const supercellIdBtn = buttons.find(b => b.text().includes("Supercell ID Rewards"));
    expect(supercellIdBtn).toBeDefined();

    // Trigger click to inspect URL passed to openExternal
    supercellIdBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://id.supercell.com/fr/clashroyale/");

    const crStoreBtn = buttons.find(b => b.text().includes("Clash Royale Store"));
    expect(crStoreBtn).toBeDefined();

    crStoreBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://store.supercell.com/fr/clashroyale");
  });

  it("uses the versioned latest APK URL resolved from metadata", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        buildNumber: 179,
        filename: "clashmanager-v14.43.4+179.apk",
        version: "14.43.4"
      })
    });

    const wrapper = mountComponent();
    await new Promise(resolve => setTimeout(resolve, 1));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/raw\.githubusercontent\.com\/AlbiDR\/Clash-Manager\/Beta\/APK\/release\/latest\.json\?t=\d+$/,
      ),
      expect.objectContaining({ cache: "no-store" })
    );

    const buttons = wrapper.findAll("button");
    const downloadBtn = buttons.find(b => b.text().includes("Download Android App"));
    expect(downloadBtn).toBeDefined();

    await downloadBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.43.4%2B179.apk"
    );
  });

  it("does not render the Android app download link if release resolution fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.reject(new Error("Network Failure"))
    );

    const wrapper = mountComponent();
    await new Promise(resolve => setTimeout(resolve, 1));

    const buttons = wrapper.findAll("button");
    const downloadBtn = buttons.find(b => b.text().includes("Download Android App"));
    expect(downloadBtn).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
