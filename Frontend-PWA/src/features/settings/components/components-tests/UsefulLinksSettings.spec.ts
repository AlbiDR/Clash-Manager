// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UsefulLinksSettings from "../UsefulLinksSettings.vue";
import { ref } from "vue";
import * as useSettingsModule from "../../composables/useSettings";

vi.mock("../../composables/useSettings", () => ({
  useSettings: vi.fn()
}));

describe("UsefulLinksSettings.vue", () => {
  const mockIsRefreshing = ref(false);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRefreshing.value = false;

    vi.mocked(useSettingsModule.useSettings).mockReturnValue({
      isRefreshing: mockIsRefreshing
    } as any);
  });

  it("renders the links card with all specified links", () => {
    const wrapper = mount(UsefulLinksSettings, {
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

    const links = wrapper.findAll("a");
    const labels = links.map(link => link.find(".link-label").text());

    expect(labels).toContain("RoyaleAPI Blog");
    expect(labels).toContain("RoyaleAPI Giveaway");
    expect(labels).toContain("Supercell ID Rewards");
    expect(labels).toContain("Clash Royale Store");
    expect(labels).toContain("GitHub Repository");
  });
});
