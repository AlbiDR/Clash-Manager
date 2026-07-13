// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { getCurrencyAsset, getWildcardAsset, getTowerLevelAsset } from "../assets";

describe("assets utility", () => {
  const BASE_URL = import.meta.env.BASE_URL || "/";

  describe("getCurrencyAsset", () => {
    it("should resolve the path for gold", () => {
      expect(getCurrencyAsset("gold")).toBe(`${BASE_URL}assets/game/currency-gold.webp`);
    });

    it("should resolve the path for gem", () => {
      expect(getCurrencyAsset("gem")).toBe(`${BASE_URL}assets/game/currency-gem.webp`);
    });

    it("should resolve the path for xp", () => {
      expect(getCurrencyAsset("xp")).toBe(`${BASE_URL}assets/game/currency-xp.webp`);
    });
  });

  describe("getWildcardAsset", () => {
    it("should resolve the path for common rarity", () => {
      expect(getWildcardAsset("common")).toBe(`${BASE_URL}assets/game/wildcard-common.webp`);
    });

    it("should be case-insensitive for rarity", () => {
      expect(getWildcardAsset("Legendary")).toBe(`${BASE_URL}assets/game/wildcard-legendary.webp`);
      expect(getWildcardAsset("EPIC")).toBe(`${BASE_URL}assets/game/wildcard-epic.webp`);
    });
  });

  describe("getTowerLevelAsset", () => {
    it("should resolve the path for the tower level icon", () => {
      expect(getTowerLevelAsset()).toBe(`${BASE_URL}assets/game/tower-level.webp`);
    });
  });
});
