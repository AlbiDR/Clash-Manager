import { calculateProgressionPath } from "./Frontend-PWA/src/features/laboratory/logic/Simulation";
import { ProjectionStrategy } from "./Frontend-PWA/src/features/laboratory/logic/ScoringStrategy";
import { asGold, asGems } from "./Frontend-PWA/src/core/utils/economy";
import type { PlayerProfile } from "./Frontend-PWA/src/features/laboratory/logic/Types";

const mockProfile: PlayerProfile = {
  tag: "#Y0QGUG9L",
  name: "Albi",
  expPoints: 0,
  starPoints: 0,
  kingLevel: 14,
  currentKingLevel: 14,
  cards: []
};

// Create some cards to simulate a real profile (not all 16)
for (let i = 0; i < 50; i++) {
  mockProfile.cards.push({
    name: `Card ${i}`,
    id: 26000000 + i,
    level: 14,
    maxLevel: 14,
    count: 0,
    iconUrls: { medium: "" },
    rarity: "Common",
    isTowerTroop: false
  });
}

const inventory = {
  gold: asGold(1000000),
  gems: asGems(10000),
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
  totalXp: 0 as any,
  totalGoldSpent: asGold(0),
  totalGemsSpent: asGems(0),
  totalWildCardsUsed: { "Common": 0, "Rare": 0, "Epic": 0, "Legendary": 0, "Champion": 0 },
  history: [],
  deck: {} // not used in Simulation.ts anymore
};

const generator = calculateProgressionPath(initialState, settings, new ProjectionStrategy());
let iterations = 0;
let lastState = null;

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
console.log("Did it reach target?", Number(lastState.totalXp) >= 10938770);

