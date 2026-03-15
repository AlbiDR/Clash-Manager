import { describe, it, expect } from 'vitest';
import {
  asGold, asGems, asXP,
  addGold, subGold, canAffordGold,
  addGems, subGems, canAffordGems,
  convertGemsToGold, calculateGemCostForGold,
  addXP,
  GEM_TO_GOLD_FACTOR
} from '../economy';

describe('Economy Module', () => {
  describe('Type Casting (Branding)', () => {
    it('should cast numbers to branded types', () => {
      expect(asGold(100)).toBe(100);
      expect(asGems(50)).toBe(50);
      expect(asXP(1000)).toBe(1000);
    });
  });

  describe('Gold Arithmetic', () => {
    it('should add gold correctly', () => {
      expect(addGold(asGold(100), asGold(50))).toBe(150);
    });

    it('should subtract gold correctly', () => {
      expect(subGold(asGold(100), asGold(40))).toBe(60);
    });

    it('should clamp gold subtraction to 0', () => {
      expect(subGold(asGold(10), asGold(50))).toBe(0);
    });

    it('should check affordability correctly', () => {
      expect(canAffordGold(asGold(100), asGold(50))).toBe(true);
      expect(canAffordGold(asGold(100), asGold(100))).toBe(true);
      expect(canAffordGold(asGold(100), asGold(150))).toBe(false);
    });
  });

  describe('Gem Arithmetic', () => {
    it('should add gems correctly', () => {
      expect(addGems(asGems(10), asGems(5))).toBe(15);
    });

    it('should subtract gems correctly', () => {
      expect(subGems(asGems(20), asGems(5))).toBe(15);
    });

    it('should clamp gem subtraction to 0', () => {
      expect(subGems(asGems(5), asGems(10))).toBe(0);
    });

    it('should check affordability correctly', () => {
      expect(canAffordGems(asGems(10), asGems(5))).toBe(true);
      expect(canAffordGems(asGems(10), asGems(10))).toBe(true);
      expect(canAffordGems(asGems(10), asGems(15))).toBe(false);
    });
  });

  describe('Currency Conversion', () => {
    it('should convert gems to gold using the factor', () => {
      const gems = asGems(10);
      expect(convertGemsToGold(gems)).toBe(10 * GEM_TO_GOLD_FACTOR);
    });

    it('should handle floor when converting gems to gold (if factor was fractional)', () => {
      // Though GEM_TO_GOLD_FACTOR is 20, testing the floor logic
      expect(convertGemsToGold(asGems(1))).toBe(20);
    });

    it('should calculate gem cost for gold deficit correctly', () => {
      const deficit = asGold(100);
      expect(calculateGemCostForGold(deficit)).toBe(5); // 100 / 20 = 5
    });

    it('should ceil the gem cost for gold deficit', () => {
      const deficit = asGold(21);
      expect(calculateGemCostForGold(deficit)).toBe(2); // 21 / 20 = 1.05 -> 2
    });

    it('should return 0 gems for zero or negative gold deficit', () => {
      expect(calculateGemCostForGold(asGold(0))).toBe(0);
      expect(calculateGemCostForGold(asGold(-10))).toBe(0);
    });
  });

  describe('XP Logic', () => {
    it('should add XP correctly', () => {
      expect(addXP(asXP(100), asXP(200))).toBe(300);
    });
  });
});
