import { describe, it, expect } from "vitest";
import { calculateProgressionPath } from "../Simulation";
import type { SimulationState, OptimizationSettings, PlayerData, PlayerProfile, Inventory, Card, UpgradeAction } from "../Types";

// Mock data to match a typical Level 76 player
const mockProfile: PlayerProfile = {
  name: "Debug Player",
  tag: "#DEBUG",
  kingLevel: 76,
  xpIntoLevel: 0,
  arena: "Legendary Arena",
  clanName: "Debug Clan",
  legacyTrophies: 0
};

const mockInventory: Inventory = {
  gold: 100000 as any,
  gems: 1000 as any,
  wildCards: {
    Common: 0,
    Rare: 0,
    Epic: 0,
    Legendary: 0,
    Champion: 0
  }
};

const mockCards: Card[] = Array.from({ length: 115 }).map((_, i) => ({
  name: `Card ${i}` as any,
  rarity: "Common",
  level: 1,
  count: 5000,
  isTowerTroop: false
}));

const initialState: SimulationState = {
  roster: mockCards,
  inventory: mockInventory,
  totalXp: 7138770 as any, // Level 76 XP
  history: [],
  totalGoldSpent: 0 as any,
  totalGemsSpent: 0 as any,
  totalWildCardsUsed: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 }
};

describe("Debug Simulation Reactivity", () => {
  it("should run properly for Level 80 target", () => {
    const settings: OptimizationSettings = {
      strategy: "Level Projection",
      allowGemSpending: false,
      infiniteResources: true, // Projection forces this
      targetLevel: 80
    };

    const generator = calculateProgressionPath(initialState, settings);
    let lastState: SimulationState | null = null;
    let iterations = 0;

    while (true) {
      const { value, done } = generator.next();
      if (done) {
        if (value) lastState = value as SimulationState;
        break;
      }
      lastState = value as SimulationState;
      iterations++;
    }

    console.log("Iterations run:", iterations);
    console.log("Final total XP:", lastState?.totalXp);
    
    // Level 80 requires 10,938,770 XP
    expect(Number(lastState?.totalXp)).toBeGreaterThanOrEqual(10938770);
  });
});
