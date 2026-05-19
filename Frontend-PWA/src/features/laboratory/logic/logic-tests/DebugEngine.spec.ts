// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import { calculateProgressionPath } from '../Simulation';
import ProfileHydrator from '../ProfileHydrator';
import { asGold, asGems } from '@core/utils/economy';
import type { PlayerData, PlayerProfile, Card, Inventory, OptimizationSettings } from '../Types';

describe('Laboratory Engine Diagnostic', () => {
  it("should reach Level 80 from Level 76 with infinite resources", () => {
    // 1. Setup a Level 76 player
    const profile: PlayerProfile = {
      tag: "#USER",
      name: "Test User",
      kingLevel: 76,
      xpIntoLevel: 10000 as any
    };

    // 2. High-level cards (all Level 13, ready for 14/15/16)
    const roster: Card[] = Array(100).fill(null).map((_, i) => ({
      id: i,
      name: `Card ${i}`,
      level: 13,
      count: 20000,
      rarity: "Common",
      isTowerTroop: false
    }));

    const inventory: Inventory = {
      gold: asGold(100000000), 
      gems: asGems(0),
      wildCards: {
        Common: 0,
        Rare: 0,
        Epic: 0,
        Legendary: 0,
        Champion: 0
      }
    };

    // Note: ProfileHydrator expects { profile, inventory, cards }
    const data = { profile, inventory, cards: roster };
    const initialState = ProfileHydrator.createInitialState(data as any);

    // 3. Simulation Settings
    const settings: OptimizationSettings = {
      strategy: "Level Projection",
      infiniteResources: true,
      allowGemSpending: false,
      targetLevel: 80
    };

    // 4. Run Simulation
    const engine = calculateProgressionPath(initialState, settings);
    let lastState = null;
    let stepCount = 0;

    for (const state of engine) {
      lastState = state;
      stepCount++;
    }

    if (!lastState) throw new Error("Simulation produced no states");

    console.log("Initial Level:", 76);
    console.log("Final XP:", lastState.totalXp);
    console.log("Steps Count:", stepCount);

    // 5. Assertions
    expect(stepCount).toBeGreaterThan(0);
    // Total XP should be >= 10,938,770 (Level 80)
    expect(Number(lastState.totalXp)).toBeGreaterThanOrEqual(10938770);
  });
});
