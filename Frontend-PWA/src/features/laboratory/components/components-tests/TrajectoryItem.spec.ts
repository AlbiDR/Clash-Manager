// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TrajectoryItem from "../TrajectoryItem.vue";
import { type UpgradeAction } from "../../logic";

describe("TrajectoryItem.vue", () => {
  const mockUpgrade: UpgradeAction = {
    cardName: "Knight",
    rarity: "Common",
    currentLevel: 13,
    targetLevel: 14,
    goldCost: 100000 as any,
    cardCost: 5000,
    wildCardsUsed: 0,
    gemsUsed: 0 as any,
    xpGained: 1600 as any,
    efficiencyIndex: 1.25,
    upgradeType: "Direct",
    isTowerTroop: false
  };

  const createWrapper = (props = {}) => {
    return mount(TrajectoryItem, {
      props: {
        upgrade: mockUpgrade,
        index: 0,
        ...props
      },
      global: {
        stubs: {
          Icon: {
            template: '<span class="mock-icon" :name="name"></span>',
            props: ['name']
          }
        }
      }
    });
  };

  it("renders card name and level progression correctly", () => {
    const wrapper = createWrapper();
    expect(wrapper.find(".card-name").text()).toBe("Knight");
    expect(wrapper.find(".prev").text()).toBe("13");
    expect(wrapper.find(".next").text()).toBe("14");
    expect(wrapper.find(".logic-type").text()).toBe("Direct");
  });

  it("applies the correct rarity class", () => {
    const rarities: UpgradeAction["rarity"][] = ["Common", "Rare", "Epic", "Legendary", "Champion"];
    rarities.forEach(rarity => {
      const wrapper = createWrapper({
        upgrade: { ...mockUpgrade, rarity }
      });
      expect(wrapper.classes()).toContain(rarity.toLowerCase());
    });
  });

  it("renders tower badge when isTowerTroop is true", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, isTowerTroop: true }
    });
    expect(wrapper.find(".tower-badge").exists()).toBe(true);
  });

  it("does not render tower badge when isTowerTroop is false", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, isTowerTroop: false }
    });
    expect(wrapper.find(".tower-badge").exists()).toBe(false);
  });

  it("renders efficiency index correctly", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, efficiencyIndex: 2.5 }
    });
    expect(wrapper.find(".eff-val").text()).toBe("2.50");
  });

  it("renders gold cost correctly formatted", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, goldCost: 100000 as any }
    });
    // Intl.NumberFormat().format(100000) usually results in "100,000" or "100 000" depending on locale
    const goldText = wrapper.find(".cost-item.gold .val").text();
    expect(goldText.replace(/\D/g, "")).toBe("100000");
  });

  it("renders wild cards cost when wildCardsUsed > 0 and gemsUsed is 0", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, wildCardsUsed: 100, gemsUsed: 0 as any }
    });
    expect(wrapper.find(".cost-item.wild").exists()).toBe(true);
    expect(wrapper.find(".cost-item.wild .val").text()).toBe("100");
    expect(wrapper.find(".cost-item.gem").exists()).toBe(false);
  });

  it("renders gem cost when gemsUsed > 0, even if wildCardsUsed > 0", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, wildCardsUsed: 100, gemsUsed: 50 as any }
    });
    expect(wrapper.find(".cost-item.gem").exists()).toBe(true);
    expect(wrapper.find(".cost-item.gem .val").text()).toBe("50");
    expect(wrapper.find(".cost-item.wild").exists()).toBe(false);
  });

  it("renders XP gained correctly", () => {
    const wrapper = createWrapper({
      upgrade: { ...mockUpgrade, xpGained: 1600 as any }
    });
    expect(wrapper.find(".cost-item.xp .val").text()).toBe("+1,600");
  });

  it("sets the animation delay based on index", () => {
    const wrapper = createWrapper({ index: 5 });
    const style = wrapper.attributes("style");
    expect(style).toContain("--i: 5");
  });
});
