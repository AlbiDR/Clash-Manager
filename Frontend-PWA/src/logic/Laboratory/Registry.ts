import type { Rarity } from './Types';
import { asGold, asXP, type Gold, type XP } from './Economy';

export const CARD_LEVEL_CAP = 16;

export const CARD_RARITY_START_LEVELS: Readonly<Record<Rarity, number>> = {
  "Common": 1,
  "Rare": 3,
  "Epic": 6,
  "Legendary": 9,
  "Champion": 11
};

// --- Logic Calibration (Engine 2.3) ---
export const LOOKAHEAD_WEIGHT = 0.4;
export const LOOKAHEAD_PRECISION = 0.01;

export const GOLD_COST_TABLE: Readonly<Record<number, Gold>> = {
  2: asGold(5), 3: asGold(20), 4: asGold(50), 5: asGold(150), 6: asGold(400), 7: asGold(1000), 8: asGold(2000),
  9: asGold(4000), 10: asGold(8000), 11: asGold(15000), 12: asGold(25000), 13: asGold(40000), 14: asGold(60000), 15: asGold(90000), 16: asGold(120000)
};

export const CARD_XP_TABLE: Readonly<Record<number, XP>> = {
  2: asXP(4), 3: asXP(5), 4: asXP(6), 5: asXP(10), 6: asXP(25), 7: asXP(50), 8: asXP(100),
  9: asXP(200), 10: asXP(400), 11: asXP(600), 12: asXP(800), 13: asXP(1600), 14: asXP(2000), 15: asXP(50000), 16: asXP(200000)
};

export const MATERIAL_REQUIREMENTS: Readonly<Record<Rarity, Readonly<Record<number, number>>>> = {
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

export const GEM_CONVERSION_RATES: Readonly<Record<Rarity, number>> = {
  "Common": 0.36,
  "Rare": 2.14,
  "Epic": 21.666666667,
  "Legendary": 210.0,
  "Champion": 400.0
};

export const KING_XP_TABLE = [
  { level: 1, cumulative: asXP(0) },
  { level: 2, cumulative: asXP(20) },
  { level: 3, cumulative: asXP(70) },
  { level: 4, cumulative: asXP(120) },
  { level: 5, cumulative: asXP(170) },
  { level: 6, cumulative: asXP(250) },
  { level: 7, cumulative: asXP(370) },
  { level: 8, cumulative: asXP(495) },
  { level: 9, cumulative: asXP(625) },
  { level: 10, cumulative: asXP(770) },
  { level: 11, cumulative: asXP(970) },
  { level: 12, cumulative: asXP(1190) },
  { level: 13, cumulative: asXP(1470) },
  { level: 14, cumulative: asXP(1770) },
  { level: 15, cumulative: asXP(2120) },
  { level: 16, cumulative: asXP(2570) },
  { level: 17, cumulative: asXP(3120) },
  { level: 18, cumulative: asXP(3770) },
  { level: 19, cumulative: asXP(4570) },
  { level: 20, cumulative: asXP(5770) },
  { level: 21, cumulative: asXP(7170) },
  { level: 22, cumulative: asXP(8770) },
  { level: 23, cumulative: asXP(10770) },
  { level: 24, cumulative: asXP(13070) },
  { level: 25, cumulative: asXP(15770) },
  { level: 26, cumulative: asXP(18770) },
  { level: 27, cumulative: asXP(22770) },
  { level: 28, cumulative: asXP(27370) },
  { level: 29, cumulative: asXP(32770) },
  { level: 30, cumulative: asXP(38770) },
  { level: 31, cumulative: asXP(45770) },
  { level: 32, cumulative: asXP(53770) },
  { level: 33, cumulative: asXP(62770) },
  { level: 34, cumulative: asXP(73770) },
  { level: 35, cumulative: asXP(86270) },
  { level: 36, cumulative: asXP(98770) },
  { level: 37, cumulative: asXP(111270) },
  { level: 38, cumulative: asXP(123770) },
  { level: 39, cumulative: asXP(138770) },
  { level: 40, cumulative: asXP(156770) },
  { level: 41, cumulative: asXP(178770) },
  { level: 42, cumulative: asXP(203770) },
  { level: 43, cumulative: asXP(228770) },
  { level: 44, cumulative: asXP(253770) },
  { level: 45, cumulative: asXP(278770) },
  { level: 46, cumulative: asXP(303770) },
  { level: 47, cumulative: asXP(328770) },
  { level: 48, cumulative: asXP(353770) },
  { level: 49, cumulative: asXP(378770) },
  { level: 50, cumulative: asXP(403770) },
  { level: 51, cumulative: asXP(428770) },
  { level: 52, cumulative: asXP(468770) },
  { level: 53, cumulative: asXP(523770) },
  { level: 54, cumulative: asXP(593770) },
  { level: 55, cumulative: asXP(678770) },
  { level: 56, cumulative: asXP(778770) },
  { level: 57, cumulative: asXP(893770) },
  { level: 58, cumulative: asXP(1023770) },
  { level: 59, cumulative: asXP(1168770) },
  { level: 60, cumulative: asXP(1328770) },
  { level: 61, cumulative: asXP(1508770) },
  { level: 62, cumulative: asXP(1708770) },
  { level: 63, cumulative: asXP(1928770) },
  { level: 64, cumulative: asXP(2168770) },
  { level: 65, cumulative: asXP(2428770) },
  { level: 66, cumulative: asXP(2708770) },
  { level: 67, cumulative: asXP(3008770) },
  { level: 68, cumulative: asXP(3328770) },
  { level: 69, cumulative: asXP(3668770) },
  { level: 70, cumulative: asXP(4028770) },
  { level: 71, cumulative: asXP(4418770) },
  { level: 72, cumulative: asXP(4838770) },
  { level: 73, cumulative: asXP(5288770) },
  { level: 74, cumulative: asXP(5838770) },
  { level: 75, cumulative: asXP(6438770) },
  { level: 76, cumulative: asXP(7138770) },
  { level: 77, cumulative: asXP(7938770) },
  { level: 78, cumulative: asXP(8838770) },
  { level: 79, cumulative: asXP(9838770) },
  { level: 80, cumulative: asXP(10938770) },
  { level: 81, cumulative: asXP(12138770) },
  { level: 82, cumulative: asXP(13438770) },
  { level: 83, cumulative: asXP(14838770) },
  { level: 84, cumulative: asXP(16338770) },
  { level: 85, cumulative: asXP(17938770) },
  { level: 86, cumulative: asXP(19638770) },
  { level: 87, cumulative: asXP(21438770) },
  { level: 88, cumulative: asXP(23338770) },
  { level: 89, cumulative: asXP(25338770) },
  { level: 90, cumulative: asXP(27438770) }
];

export const IMPORTANT_KING_LEVELS: ReadonlyArray<number> = [
  2, 3, 5, 7, 10, 14, 18, 22, 26, 30, 34, 38, 42, 54, 75
];

export const EFFICIENCY_OVERRIDES: Readonly<Record<string, number>> = {
  // Add specific card overrides here if necessary
};

