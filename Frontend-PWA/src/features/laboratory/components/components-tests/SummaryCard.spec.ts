// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import SummaryCard from "../SummaryCard.vue";

// Mock @shared to avoid side effects and complex imports
vi.mock("@shared", () => ({
  Icon: {
    name: "Icon",
    template: "<div class='mock-icon'></div>",
    props: ["name", "size"]
  }
}));

describe("SummaryCard.vue", () => {
  const mockProfile: any = {
    name: "Test Player",
    tag: "ABC123",
    kingLevel: 14,
    currentKingLevel: 14
  };

  const mockResult: any = {
    actions: [{}, {}], // 2 upgrades
    projectedKingLevel: 15,
    totalXpGained: 10000,
    totalGoldSpent: 50000,
    totalGemsSpent: 0
  };

  it("renders player info correctly", () => {
    const wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: mockResult
      }
    });

    expect(wrapper.find(".player-name").text()).toBe("Test Player");
    expect(wrapper.find(".player-tag").text()).toBe("#ABC123");
  });

  it("normalizes player tag if # is missing", () => {
    const profileNoHash = { ...mockProfile, tag: "TAG123" };
    const wrapper = mount(SummaryCard, {
      props: {
        profile: profileNoHash,
        result: mockResult
      }
    });
    expect(wrapper.find(".player-tag").text()).toBe("#TAG123");
  });

  it("does not add extra # if player tag already has one", () => {
    const profileWithHash = { ...mockProfile, tag: "#TAG123" };
    const wrapper = mount(SummaryCard, {
      props: {
        profile: profileWithHash,
        result: mockResult
      }
    });
    expect(wrapper.find(".player-tag").text()).toBe("#TAG123");
  });

  it("renders trajectory count and pluralizes correctly", async () => {
    // 2 upgrades
    let wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: mockResult
      }
    });
    const badges = wrapper.findAll(".projection-badge .value");
    expect(badges[badges.length - 1].text()).toBe("2 Upgrades");

    // 1 upgrade
    const resultOneAction = { ...mockResult, actions: [{}] };
    wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: resultOneAction
      }
    });
    const badgesOne = wrapper.findAll(".projection-badge .value");
    expect(badgesOne[badgesOne.length - 1].text()).toBe("1 Upgrade");
  });

  it("displays king level progression correctly", () => {
    const wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: mockResult
      }
    });

    expect(wrapper.find(".level-badge.current .num").text()).toBe("14");
    expect(wrapper.find(".level-badge.target .num").text()).toBe("15");
  });

  it("renders formatted gold and xp resources", () => {
    const resultLotsOfResources = {
      ...mockResult,
      totalXpGained: 1234567,
      totalGoldSpent: 9876543
    };
    const wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: resultLotsOfResources
      }
    });

    expect(wrapper.find(".res-slab.xp .val").text()).toContain("1,234,567");
    expect(wrapper.find(".res-slab.gold .val").text()).toContain("9,876,543");
  });

  it("conditionally renders gem slab and layout class", async () => {
    // No gems
    let wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: mockResult
      }
    });
    expect(wrapper.find(".res-slab.gems").exists()).toBe(false);
    expect(wrapper.find(".resources-grid").classes()).not.toContain("triple");

    // With gems
    const resultWithGems = { ...mockResult, totalGemsSpent: 500 };
    wrapper = mount(SummaryCard, {
      props: {
        profile: mockProfile,
        result: resultWithGems
      }
    });
    expect(wrapper.find(".res-slab.gems").exists()).toBe(true);
    expect(wrapper.find(".res-slab.gems .val").text()).toBe("500");
    expect(wrapper.find(".resources-grid").classes()).toContain("triple");
  });
});
