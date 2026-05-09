import { KING_XP_TABLE } from './Frontend-PWA/src/features/laboratory/logic/Registry';
import { calculateProgressionPath } from './Frontend-PWA/src/features/laboratory/logic/Simulation';
import type { OptimizationSettings, SimulationState, Inventory } from './Frontend-PWA/src/features/laboratory/logic/Types';
import { asGold, asGems, asXP } from './Frontend-PWA/src/core/utils/economy';

// Mock minimal state
const inventory: Inventory = {
  gold: asGold(0),
  gems: asGems(0),
  wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } as any
};

const state: SimulationState = {
  roster: Array(115).fill(0).map((_, i) => ({
    name: `Card ${i}` as any,
    rarity: 'Common' as any,
    level: 1,
    count: 0,
    isTowerTroop: false
  })),
  inventory,
  totalXp: asXP(7138770), // Level 76
  totalGoldSpent: asGold(0),
  totalGemsSpent: asGems(0),
  totalWildCardsUsed: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 },
  history: []
};

const settings: OptimizationSettings = {
  strategy: 'Level Projection',
  allowGemSpending: true,
  infiniteResources: true,
  targetLevel: 80
};

const generator = calculateProgressionPath(state, settings);
let finalState;
for (let state of generator) {
  finalState = state;
}

console.log("Final XP:", finalState?.totalXp);
console.log("Expected XP:", KING_XP_TABLE.find(x => x.level === 80)?.cumulative);
