
import type { Rarity } from "./Quartermaster_Types";

export const CARD_LEVEL_CAP = 16;

// Estimated conversion value to normalize Efficiency ratios (1 Gem ~= 20 Gold)
export const GEM_VALUE_IN_GOLD = 20;

// Key King Level milestones that unlock new features/abilities
export const IMPORTANT_KING_LEVELS = [
  2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 54, 75
] as const;

// Readonly Record prevents accidental modification of game rules at runtime
// Updated with high-precision values from Python source (constants.py)
export const GEM_CONVERSION_RATES: Readonly<Record<Rarity, number>> = {
  "Common": 0.36,
  "Rare": 2.14,
  "Epic": 21.666666667,
  "Legendary": 210.0,
  "Champion": 400.0
};

// Start levels for each rarity (used to normalize API data)
export const CARD_RARITY_START_LEVELS: Readonly<Record<Rarity, number>> = {
  "Common": 1,
  "Rare": 3,
  "Epic": 6,
  "Legendary": 9,
  "Champion": 11
};

// Using 'number | undefined' forces the optimizer to check if a level exists before using the value
export const GOLD_COST_TABLE: Readonly<Record<number, number | undefined>> = {
  2: 5, 3: 20, 4: 50, 5: 150, 6: 400, 7: 1000, 8: 2000,
  9: 4000, 10: 8000, 11: 15000, 12: 25000, 13: 40000, 14: 60000, 15: 90000, 16: 120000
};

export const CARD_XP_TABLE: Readonly<Record<number, number | undefined>> = {
  2: 4, 3: 5, 4: 6, 5: 10, 6: 25, 7: 50, 8: 100,
  9: 200, 10: 400, 11: 600, 12: 800, 13: 1600, 14: 2000, 15: 50000, 16: 200000
};

export const MATERIAL_REQUIREMENTS: Readonly<Record<Rarity, Readonly<Record<number, number | undefined>>>> = {
  "Common": {
    2: 2, 3: 4, 4: 10, 5: 20, 6: 50, 7: 100, 8: 200, 9: 400, 10: 800,
    11: 1000, 12: 1500, 13: 2500, 14: 3500, 15: 5500, 16: 7500
  },
  "Rare": {
    4: 2, 5: 4, 6: 10, 7: 20, 8: 50, 9: 100, 10: 200, 11: 300, 12: 400,
    13: 550, 14: 750, 15: 1000, 16: 1400
  },
  "Epic": {
    7: 2, 8: 4, 9: 10, 10: 20, 11: 30, 12: 50, 13: 70, 14: 100, 15: 130, 16: 180
  },
  "Legendary": {
    10: 2, 11: 4, 12: 6, 13: 9, 14: 12, 15: 14, 16: 20
  },
  "Champion": {
    12: 2, 13: 5, 14: 8, 15: 11, 16: 15
  }
};

export const EFFICIENCY_OVERRIDES: Readonly<Record<number, number | undefined>> = {
  16: 0.60, // Elite Wild Card conversion priority
  15: 1.80,
};

export const KING_XP_TABLE = [
  { level: 1, xpToNext: 20, cumulative: 0 },
  { level: 2, xpToNext: 50, cumulative: 20 },
  { level: 3, xpToNext: 50, cumulative: 70 },
  { level: 4, xpToNext: 50, cumulative: 120 },
  { level: 5, xpToNext: 80, cumulative: 170 },
  { level: 6, xpToNext: 120, cumulative: 250 },
  { level: 7, xpToNext: 125, cumulative: 370 },
  { level: 8, xpToNext: 130, cumulative: 495 },
  { level: 9, xpToNext: 145, cumulative: 625 },
  { level: 10, xpToNext: 200, cumulative: 770 },
  { level: 11, xpToNext: 220, cumulative: 970 },
  { level: 12, xpToNext: 280, cumulative: 1190 },
  { level: 13, xpToNext: 300, cumulative: 1470 },
  { level: 14, xpToNext: 350, cumulative: 1770 },
  { level: 15, xpToNext: 450, cumulative: 2120 },
  { level: 16, xpToNext: 550, cumulative: 2570 },
  { level: 17, xpToNext: 650, cumulative: 3120 },
  { level: 18, xpToNext: 800, cumulative: 3770 },
  { level: 19, xpToNext: 1200, cumulative: 4570 },
  { level: 20, xpToNext: 1400, cumulative: 5770 },
  { level: 21, xpToNext: 1600, cumulative: 7170 },
  { level: 22, xpToNext: 2000, cumulative: 8770 },
  { level: 23, xpToNext: 2300, cumulative: 10770 },
  { level: 24, xpToNext: 2700, cumulative: 13070 },
  { level: 25, xpToNext: 3000, cumulative: 15770 },
  { level: 26, xpToNext: 4000, cumulative: 18770 },
  { level: 27, xpToNext: 4600, cumulative: 22770 },
  { level: 28, xpToNext: 5400, cumulative: 27370 },
  { level: 29, xpToNext: 6000, cumulative: 32770 },
  { level: 30, xpToNext: 7000, cumulative: 38770 },
  { level: 31, xpToNext: 8000, cumulative: 45770 },
  { level: 32, xpToNext: 9000, cumulative: 53770 },
  { level: 33, xpToNext: 11000, cumulative: 62770 },
  { level: 34, xpToNext: 12500, cumulative: 73770 },
  { level: 35, xpToNext: 12500, cumulative: 86270 },
  { level: 36, xpToNext: 12500, cumulative: 98770 },
  { level: 37, xpToNext: 12500, cumulative: 111270 },
  { level: 38, xpToNext: 15000, cumulative: 123770 },
  { level: 39, xpToNext: 18000, cumulative: 138770 },
  { level: 40, xpToNext: 22000, cumulative: 156770 },
  { level: 41, xpToNext: 25000, cumulative: 178770 },
  { level: 42, xpToNext: 25000, cumulative: 203770 },
  { level: 43, xpToNext: 25000, cumulative: 228770 },
  { level: 44, xpToNext: 25000, cumulative: 253770 },
  { level: 45, xpToNext: 25000, cumulative: 278770 },
  { level: 46, xpToNext: 25000, cumulative: 303770 },
  { level: 47, xpToNext: 25000, cumulative: 328770 },
  { level: 48, xpToNext: 25000, cumulative: 353770 },
  { level: 49, xpToNext: 25000, cumulative: 378770 },
  { level: 50, xpToNext: 25000, cumulative: 403770 },
  { level: 51, xpToNext: 40000, cumulative: 428770 },
  { level: 52, xpToNext: 55000, cumulative: 468770 },
  { level: 53, xpToNext: 70000, cumulative: 523770 },
  { level: 54, xpToNext: 85000, cumulative: 593770 },
  { level: 55, xpToNext: 100000, cumulative: 678770 },
  { level: 56, xpToNext: 115000, cumulative: 778770 },
  { level: 57, xpToNext: 130000, cumulative: 893770 },
  { level: 58, xpToNext: 145000, cumulative: 1023770 },
  { level: 59, xpToNext: 160000, cumulative: 1168770 },
  { level: 60, xpToNext: 180000, cumulative: 1328770 },
  { level: 61, xpToNext: 200000, cumulative: 1508770 },
  { level: 62, xpToNext: 220000, cumulative: 1708770 },
  { level: 63, xpToNext: 240000, cumulative: 1928770 },
  { level: 64, xpToNext: 260000, cumulative: 2168770 },
  { level: 65, xpToNext: 280000, cumulative: 2428770 },
  { level: 66, xpToNext: 300000, cumulative: 2708770 },
  { level: 67, xpToNext: 320000, cumulative: 3008770 },
  { level: 68, xpToNext: 340000, cumulative: 3328770 },
  { level: 69, xpToNext: 360000, cumulative: 3668770 },
  { level: 70, xpToNext: 390000, cumulative: 4028770 },
  { level: 71, xpToNext: 420000, cumulative: 4418770 },
  { level: 72, xpToNext: 450000, cumulative: 4838770 },
  { level: 73, xpToNext: 550000, cumulative: 5288770 },
  { level: 74, xpToNext: 600000, cumulative: 5838770 },
  { level: 75, xpToNext: 700000, cumulative: 6438770 },
  { level: 76, xpToNext: 800000, cumulative: 7138770 },
  { level: 77, xpToNext: 900000, cumulative: 7938770 },
  { level: 78, xpToNext: 1000000, cumulative: 8838770 },
  { level: 79, xpToNext: 1100000, cumulative: 9838770 },
  { level: 80, xpToNext: 1200000, cumulative: 10938770 },
  { level: 81, xpToNext: 1300000, cumulative: 12138770 },
  { level: 82, xpToNext: 1400000, cumulative: 13438770 },
  { level: 83, xpToNext: 1500000, cumulative: 14838770 },
  { level: 84, xpToNext: 1600000, cumulative: 16338770 },
  { level: 85, xpToNext: 1700000, cumulative: 17938770 },
  { level: 86, xpToNext: 1800000, cumulative: 19638770 },
  { level: 87, xpToNext: 1900000, cumulative: 21438770 },
  { level: 88, xpToNext: 2000000, cumulative: 23338770 },
  { level: 89, xpToNext: 2100000, cumulative: 25338770 },
  { level: 90, xpToNext: 2200000, cumulative: 27438770 }
] as const;
