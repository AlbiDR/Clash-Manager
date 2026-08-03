// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import UsefulLinksSettings from "../UsefulLinksSettings.vue";
import { ref, computed } from "vue";
import * as useSettingsModule from "../../composables/useSettings";
import * as useExternalLinkModule from "@core/services/useExternalLink";
import * as useNativeBridgeModule from "@core/services/useNativeBridge";
import * as localeModule from "@core/utils/locale";

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

  it("renders the links card with all specified links", () => {
    const wrapper = mountComponent();

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

  it("resolves dynamic filename from GitHub API during onMounted", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ filename: "clashmanager-v14.40.3+142.apk" })
      })
    );

    const wrapper = mountComponent();
    // Allow microtasks/onMounted fetches to complete
    await new Promise(resolve => setTimeout(resolve, 1));

    const buttons = wrapper.findAll("button");
    const downloadBtn = buttons.find(b => b.text().includes("Download Android App"));
    expect(downloadBtn).toBeDefined();

    await downloadBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/AlbiDR/Clash-Manager/Beta/APK/release/clashmanager-v14.40.3%2B142.apk"
    );
  });

  it("gracefully falls back to release folder URL on fetch error", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.reject(new Error("Network Failure"))
    );

    const wrapper = mountComponent();
    await new Promise(resolve => setTimeout(resolve, 1));

    const buttons = wrapper.findAll("button");
    const downloadBtn = buttons.find(b => b.text().includes("Download Android App"));
    expect(downloadBtn).toBeDefined();

    await downloadBtn!.trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/AlbiDR/Clash-Manager/tree/Beta/APK/release"
    );
  });
});
