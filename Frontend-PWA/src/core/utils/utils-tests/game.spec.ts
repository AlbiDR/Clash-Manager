// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import {
  calculateXpIntoLevel,
  calculateTotalXp,
  getKingLevelRow,
  calculateKingLevel
} from '../game';

describe('Game Utilities - XP Math', () => {
  it('should correctly calculate XP into level from total XP', () => {
    // Level 1: 0, Level 2: 20
    expect(calculateXpIntoLevel(0)).toBe(0);
    expect(calculateXpIntoLevel(10)).toBe(10);
    expect(calculateXpIntoLevel(20)).toBe(0);
    expect(calculateXpIntoLevel(25)).toBe(5);
  });

  it('should correctly calculate total XP from level and relative progress', () => {
    // Level 2 starts at 20
    expect(Number(calculateTotalXp(1, 10))).toBe(10);
    expect(Number(calculateTotalXp(2, 0))).toBe(20);
    expect(Number(calculateTotalXp(2, 5))).toBe(25);
  });

  it('should round-trip XP calculations correctly', () => {
    const totalXp = 1234;
    const level = calculateKingLevel(totalXp);
    const xpIntoLevel = calculateXpIntoLevel(totalXp);

    const recalculatedTotal = calculateTotalXp(level, xpIntoLevel);
    expect(Number(recalculatedTotal)).toBe(totalXp);
  });

  it('should handle edge cases and boundaries', () => {
    // Max Level (90): 27,438,770
    const maxLevelRow = getKingLevelRow(90);
    expect(maxLevelRow.level).toBe(90);

    const totalXpAtMax = Number(maxLevelRow.cumulative);
    expect(calculateKingLevel(totalXpAtMax)).toBe(90);
    expect(calculateXpIntoLevel(totalXpAtMax)).toBe(0);

    const totalXpBeyondMax = totalXpAtMax + 1000000;
    expect(calculateKingLevel(totalXpBeyondMax)).toBe(90);
    expect(calculateXpIntoLevel(totalXpBeyondMax)).toBe(1000000);
  });
});
