// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VaultCard from "../VaultCard.vue";
import { vTactile } from "@shared";
import type { Inventory } from "../../logic/Types";

// Mock Layer 1 components via deep imports to avoid Barrel side effects (ADR Section II)
vi.mock("../../../../shared/ui/Icon.vue", () => ({
  default: {
    name: "Icon",
    template: '<div class="icon-stub" :data-name="name"></div>',
    props: ["name", "size"]
  }
}));

const mockInventory: Inventory = {
  gold: 100000,
  gems: 500,
  wildCards: {
    Common: 1000,
    Rare: 200,
    Epic: 50,
    Legendary: 5,
    Champion: 1,
  },
};

describe("VaultCard.vue", () => {
  const defaultProps = {
    inventory: mockInventory,
    isSimulating: false,
  };

  const mountVaultCard = (props = {}) => {
    return mount(VaultCard, {
      props: { ...defaultProps, ...props },
      global: {
        directives: {
          tactile: vi.fn(),
        },
        stubs: {
          // Icon is already mocked via vi.mock
        },
      },
    });
  };

  it("renders the inventory values correctly", () => {
    const wrapper = mountVaultCard();

    const inputs = wrapper.findAll("input.res-input");
    expect(inputs[0].element.value).toBe("100000"); // Gold
    expect(inputs[1].element.value).toBe("500");    // Gems

    const wcInputs = wrapper.findAll("input.wc-input");
    expect(wcInputs.length).toBe(5);
    expect(wcInputs[0].element.value).toBe("1000"); // Common
    expect(wcInputs[1].element.value).toBe("200");  // Rare
    expect(wcInputs[2].element.value).toBe("50");   // Epic
    expect(wcInputs[3].element.value).toBe("5");    // Legendary
    expect(wcInputs[4].element.value).toBe("1");    // Champion
  });

  it("emits update event when gold input changes", async () => {
    const wrapper = mountVaultCard();
    const goldInput = wrapper.findAll("input.res-input")[0];

    await goldInput.setValue(150000);
    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual(["gold", 150000]);
  });

  it("emits update event when gems input changes", async () => {
    const wrapper = mountVaultCard();
    const gemsInput = wrapper.findAll("input.res-input")[1];

    await gemsInput.setValue(600);
    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual(["gems", 600]);
  });

  it("emits update event when wild card input changes", async () => {
    const wrapper = mountVaultCard();
    const commonWcInput = wrapper.findAll("input.wc-input")[0];

    await commonWcInput.setValue(1200);
    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual(["wc_common", 1200]);
  });

  it("handles invalid non-numeric input by falling back to 0", async () => {
    const wrapper = mountVaultCard();
    const goldInput = wrapper.findAll("input.res-input")[0];

    // Set value directly on the element and trigger input event
    goldInput.element.value = "invalid";
    await goldInput.trigger("input");

    expect(wrapper.emitted("update")).toBeTruthy();
    expect(wrapper.emitted("update")![0]).toEqual(["gold", 0]);
  });

  it("binds v-tactile directive to primary and wild card inputs", () => {
    const spy = vi.spyOn(vTactile, "mounted");
    mount(VaultCard, {
      props: defaultProps,
    });

    // Expecting 2 primary res-inputs and 5 wildcard wc-inputs to have v-tactile bound
    expect(spy).toHaveBeenCalledTimes(7);
    spy.mockRestore();
  });

  it("applies loading state when isSimulating is true", () => {
    const wrapper = mountVaultCard({ isSimulating: true });

    expect(wrapper.classes()).toContain("is-loading");
    // Styles for is-loading include pointer-events: none, verified via class presence
  });

  it("incorporates BASE_URL in image sources", () => {
    const wrapper = mountVaultCard();
    const goldImg = wrapper.find('img[alt="Gold"]');

    // vitest-environment-jsdom or vite-test-utils should handle import.meta.env
    // In many test setups, BASE_URL might be '/' by default
    expect(goldImg.attributes("src")).toContain("assets/game/currency-gold.webp");
  });

  // Additional comprehensive logic validation & boundary checks (Stage 2 Focus)
  describe("Comprehensive Logic Validation & Boundary Checks", () => {
    it("handles negative values correctly when input is changed", async () => {
      const wrapper = mountVaultCard();
      const gemsInput = wrapper.findAll("input.res-input")[1];

      gemsInput.element.value = "-50";
      await gemsInput.trigger("input");

      expect(wrapper.emitted("update")).toBeTruthy();
      expect(wrapper.emitted("update")!.find(e => e[0] === "gems")).toEqual(["gems", -50]);
    });

    it("handles decimals correctly by parsing them as integers via parseInt", async () => {
      const wrapper = mountVaultCard();
      const commonWcInput = wrapper.findAll("input.wc-input")[0];

      commonWcInput.element.value = "250.75";
      await commonWcInput.trigger("input");

      expect(wrapper.emitted("update")).toBeTruthy();
      expect(wrapper.emitted("update")!.find(e => e[0] === "wc_common")).toEqual(["wc_common", 250]);
    });

    it("handles empty string input correctly by falling back to 0", async () => {
      const wrapper = mountVaultCard();
      const commonWcInput = wrapper.findAll("input.wc-input")[0];

      commonWcInput.element.value = "";
      await commonWcInput.trigger("input");

      expect(wrapper.emitted("update")).toBeTruthy();
      expect(wrapper.emitted("update")!.find(e => e[0] === "wc_common")).toEqual(["wc_common", 0]);
    });

    it("handles extreme integer boundaries correctly", async () => {
      const wrapper = mountVaultCard();
      const goldInput = wrapper.findAll("input.res-input")[0];

      const bigIntStr = "9999999999";
      goldInput.element.value = bigIntStr;
      await goldInput.trigger("input");

      expect(wrapper.emitted("update")).toBeTruthy();
      expect(wrapper.emitted("update")!.find(e => e[0] === "gold")).toEqual(["gold", 9999999999]);
    });

    it("resolves exact image assets path for other wildcards rarities", () => {
      const wrapper = mountVaultCard();
      const commonImg = wrapper.find('img[alt="Common"]');
      const rareImg = wrapper.find('img[alt="Rare"]');
      const epicImg = wrapper.find('img[alt="Epic"]');
      const legendaryImg = wrapper.find('img[alt="Legendary"]');
      const championImg = wrapper.find('img[alt="Champion"]');

      expect(commonImg.attributes("src")).toContain("assets/game/wildcard-common.webp");
      expect(rareImg.attributes("src")).toContain("assets/game/wildcard-rare.webp");
      expect(epicImg.attributes("src")).toContain("assets/game/wildcard-epic.webp");
      expect(legendaryImg.attributes("src")).toContain("assets/game/wildcard-legendary.webp");
      expect(championImg.attributes("src")).toContain("assets/game/wildcard-champion.webp");
    });

    it("verifies emit callbacks for each wildcard input when they trigger update events", async () => {
      const wrapper = mountVaultCard();
      const wcInputs = wrapper.findAll("input.wc-input");
      const rarities = ["common", "rare", "epic", "legendary", "champion"];

      for (let i = 0; i < wcInputs.length; i++) {
        const input = wcInputs[i];
        const rarity = rarities[i];
        input.element.value = "42";
        await input.trigger("input");

        const updateEvents = wrapper.emitted("update");
        expect(updateEvents).toBeTruthy();
        expect(updateEvents!.some(e => e[0] === `wc_${rarity}` && e[1] === 42)).toBe(true);
      }
    });

    it("contains is-loading wrapper class when isSimulating is set to true and can trigger styling", () => {
      const wrapper = mountVaultCard({ isSimulating: true });
      expect(wrapper.find(".vault-card").classes()).toContain("is-loading");
    });
  });
});
