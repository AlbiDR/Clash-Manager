// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * About Settings Component Unit Tests
 *
 * @remarks
 * **Architectural Context:**
 * - **Domain:** Layer 3 Features (Settings Component)
 * - **Satisfaction:** ADR Section VII: Naming and Location Conventions.
 *
 * This test suite verifies correct rendering of provenance metadata, Supercell fan-content
 * compliance notice, initiallyExpanded prop pass-through, and external link handling.
 */

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AboutSettings from "../AboutSettings.vue";
import * as coreModule from "@core";

vi.mock("@core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@core")>();
  return {
    ...actual,
    appVersion: "14.45.21",
    useExternalLink: vi.fn()
  };
});

describe("AboutSettings.vue", () => {
  const mockOpenExternal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(coreModule.useExternalLink).mockReturnValue({
      openExternal: mockOpenExternal
    } as any);
  });

  const mountComponent = (props = {}) => {
    return mount(AboutSettings, {
      props,
      global: {
        stubs: {
          Icon: true,
          SettingsCard: {
            template: '<div class="settings-card-stub" :data-expanded="initiallyExpanded"><slot /></div>',
            props: ["title", "icon", "initiallyExpanded"]
          },
          LinkRow: {
            template: '<div class="link-row-stub" @click="$emit(\'click\')"><span class="label">{{ label }}</span><span class="desc">{{ description }}</span></div>',
            props: ["label", "description", "icon"]
          }
        }
      }
    });
  };

  it("renders with default initiallyExpanded prop as false", () => {
    const wrapper = mountComponent();
    const card = wrapper.find(".settings-card-stub");
    expect(card.exists()).toBe(true);
    expect(card.attributes("data-expanded")).toBe("false");
  });

  it("passes custom initiallyExpanded prop to SettingsCard", () => {
    const wrapper = mountComponent({ initiallyExpanded: true });
    const card = wrapper.find(".settings-card-stub");
    expect(card.attributes("data-expanded")).toBe("true");
  });

  it("displays version and license metadata accurately", () => {
    const wrapper = mountComponent();
    const metaCells = wrapper.findAll(".about-meta-cell");
    expect(metaCells.length).toBe(2);

    expect(metaCells[0].find(".about-meta-label").text()).toBe("Version");
    expect(metaCells[0].find(".about-meta-value").text()).toBe("14.45.21");

    expect(metaCells[1].find(".about-meta-label").text()).toBe("Licence");
    expect(metaCells[1].find(".about-meta-value").text()).toBe("GPL-3.0-only");
  });

  it("renders all about links with proper labels and descriptions", () => {
    const wrapper = mountComponent();
    const links = wrapper.findAll(".link-row-stub");
    expect(links.length).toBe(3);

    const labels = links.map((l) => l.find(".label").text());
    expect(labels).toEqual(["Report an Issue", "Source Code", "Fan Content Policy"]);
  });

  it("invokes openExternal with correct URLs when link rows are clicked", async () => {
    const wrapper = mountComponent();
    const links = wrapper.findAll(".link-row-stub");

    await links[0].trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://github.com/AlbiDR/Clash-Manager/issues/new");

    await links[1].trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://github.com/AlbiDR/Clash-Manager");

    await links[2].trigger("click");
    expect(mockOpenExternal).toHaveBeenCalledWith("https://supercell.com/en/fan-content-policy/");
  });

  it("renders the required Supercell compliance disclaimer notice", () => {
    const wrapper = mountComponent();
    const notice = wrapper.find(".about-notice");
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain("This material is unofficial and is not endorsed by Supercell.");
    expect(notice.text()).toContain("Clash Royale and Supercell are trademarks of Supercell Oy.");
  });
});
