/**
 * ============================================================================
 * 🧠 MODULE: HEADHUNTER STRATEGY
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Pure logic engine for recruitment decision making.
 *    Determines the "Trophy Floor" based on current clan composition.
 * ============================================================================
 */

export interface ClanMemberStub {
  trophies: number;
}

export interface StrategyResult {
  floor: number;
  method: string;
  mode: "ELITE" | "REBUILD" | "BASE";
}

export interface IHeadhunterStrategy {
  calculateTrophyFloor(members: ClanMemberStub[], inGameReq: number): StrategyResult;
}

const HeadhunterStrategy: IHeadhunterStrategy = {
  /**
   * Calculates the dynamic trophy floor based on clan capacity.
   * - Elite Mode (>41 members): Floor is Median of current members.
   * - Rebuild Mode (<42 members): Floor is Average of Bottom 10%.
    */
  calculateTrophyFloor(members: ClanMemberStub[], inGameReq: number): StrategyResult {
    let calculatedFloor = inGameReq;
    let calculationMethod = "In-Game Requirement";
    let mode: "ELITE" | "REBUILD" | "BASE" = "BASE";

    // Threshold: 42 or more members = Elite Mode
    const ELITE_THRESHOLD = 41;

    if (members.length > 0) {
      const allTrophies = members
        .map((m) => m.trophies || 0)
        .sort((a, b) => a - b);

      if (members.length > ELITE_THRESHOLD) {
        mode = "ELITE";
        // 🏰 ELITE MODE (Median)
        // Only accept players better than our top 50%.
        const midIndex = Math.floor(allTrophies.length / 2);
        const median = allTrophies[midIndex];

        if (median > calculatedFloor) {
            calculatedFloor = median;
            calculationMethod = `🏰 Elite Mode (Median: ${median})`;
        } else {
            calculationMethod = `🏰 Elite Mode (At In-Game Cap: ${inGameReq})`;
        }
      } else {
        mode = "REBUILD";
        // 🏗️ REBUILD MODE (Bottom 10% Avg)
        // Accept players better than the ones we typically kick.
        const bottomCount = Math.max(1, Math.ceil(allTrophies.length * 0.1));
        const bottomSlice = allTrophies.slice(0, bottomCount);
        const bottomAvg = Math.round(bottomSlice.reduce((a, b) => a + b, 0) / bottomSlice.length);

        if (bottomAvg > calculatedFloor) {
            calculatedFloor = bottomAvg;
            calculationMethod = `🏗️ Rebuild Mode (Bot 10% Avg: ${bottomAvg})`;
        } else {
             calculationMethod = `🏗️ Rebuild Mode (At In-Game Cap: ${inGameReq})`;
        }
      }
    }

    return {
      floor: calculatedFloor,
      method: calculationMethod,
      mode: mode
    };
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeadhunterStrategy;
}

// @ts-ignore
// (function(scope: any) {
//   Object.assign(scope, { HeadhunterStrategy });
// })(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterStrategy;
