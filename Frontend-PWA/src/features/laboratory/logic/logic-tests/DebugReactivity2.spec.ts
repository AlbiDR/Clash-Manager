import { describe, it, expect } from 'vitest';
import { calculateProgressionPath } from "../Simulation";
import { ProjectionStrategy } from "../ScoringStrategy";
import { asGold, asGems, asXP } from "@core/utils/economy";
import type { PlayerProfile } from "../Types";

describe("Debug Simulation with real-ish profile", () => {
  it("should simulate target level", () => {
    const mockProfile: PlayerProfile = {
      tag: "#Y0QGUG9L",
      name: "Albi",
      expPoints: 0,
      starPoints: 0,
      kingLevel: 14,
      currentKingLevel: 14,
      cards: []
    };

    // 50 cards at level 11
    for (let i = 0; i < 50; i++) {
      mockProfile.cards.push({
        name: `Card ${i}`,
        id: 26000000 + i,
        level: 11,
        maxLevel: 14,
        count: 0,
        iconUrls: { medium: "" },
        rarity: "Common",
        isTowerTroop: false
      });
    }

    const inventory = {
      gold: asGold(0), // let infiniteResources handle this
      gems: asGems(0),
      wildCards: { "Common": 0, "Rare": 0, "Epic": 0, "Legendary": 0, "Champion": 0 }
    };

    const settings = {
      strategy: "Level Projection" as const,
      allowGemSpending: false,
      infiniteResources: true,
      targetLevel: 80
    };

    const initialState = {
      roster: mockProfile.cards,
      inventory,
      totalXp: asXP(0),
      totalGoldSpent: asGold(0),
      totalGemsSpent: asGems(0),
      totalWildCardsUsed: { "Common": 0, "Rare": 0, "Epic": 0, "Legendary": 0, "Champion": 0 },
      history: [],
      deck: {}
    };

    const generator = calculateProgressionPath(initialState, settings, new ProjectionStrategy());
    let iterations = 0;
    let lastState: any = null;

    while (true) {
      const { value, done } = generator.next();
      if (done) {
        if (value) lastState = value;
        break;
      }
      lastState = value;
      iterations++;
    }

    console.log("Iterations:", iterations);
    console.log("Final totalXp:", Number(lastState.totalXp));
    console.log("Target reached:", Number(lastState.totalXp) >= 10938770);
    console.log("Final Level of Card 0:", lastState.roster[0].level);
  });
});
