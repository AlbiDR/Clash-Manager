
/**
 * ============================================================================
 * 🧠 MODULE: SCORING SYSTEM (CORE ENGINE)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The mathematical heart of the application.
 * ⚙️ ROLE: Pure Logic. Accepts raw data -> Returns Scores & Sort Orders.
 * 🔒 STATUS: PROTECTED "DO NOT MODIFY" ZONE.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 *
 * @remarks
 * This module is designed to be environment-agnostic. It is used both in the
 * Google Apps Script (GAS) environment and the high-concurrency Node.js Worker.
 * Pure mathematical functions here ensure that scoring remains consistent
 * regardless of the execution context.
 */

import type { ScoringWeights } from "./SharedTypes";

// Global Version Constant
// @ts-ignore
const VER_SCORING_SYSTEM = "11.0.0";

declare const module: any;

// Define the scoring configuration interface
export interface ScoringConfig {
  LEADERBOARD: {
    WEIGHTS: {
      FAME: number;
      AVG_FAME: number;
      DONATION: number;
      TROPHY: number;
      WAR_RATE: number;
    };
    PENALTIES: {
      INACTIVITY_GRACE_DAYS: number;
      DECAY_RATE: number;
    };
  };
  SCHEMA: {
    LB: {
      PERF_SCORE: number;
      RAW_SCORE: number;
      WAR_RATE: number;
      TOTAL_DON: number;
      DAYS: number;
      TROPHIES: number;
    };
  };
}

// Global CONFIG declaration for GAS environment
declare const CONFIG: ScoringConfig;

export interface IScoringSystem {
  calculateWarRate(
    totalBattleCredits: number,
    eligibleBattleDays: number,
  ): number;
  computeScores(
    currentFame: number,
    averageFame: number,
    weeklyDonations: number,
    trophies: number,
    warRateVal: number,
    lastSeenDate: number,
    now: number,
  ): { raw: number; perf: number };
  comparator(rowA: (string | number)[], rowB: (string | number)[]): number;
  calculateRecruitRawScore(
    trophies: number,
    totalDonations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: ScoringWeights | null,
  ): number;
  calculateHybridBenchmark(
    clanScoredList: Array<{ rawScore: number; perfScore: number }>,
    blacklistScoredList: Array<{ rawScore: number }>,
  ): number;
  calculatePotentialScore(rawScore: number, benchmark: number): number;
  resolveWarFame(p: any): number;
}

var ScoringSystem: IScoringSystem = {
  /**
   * ⚔️ Calculates the War Participation Rate (Daily Attendance Model).
   * Formula: totalBattleCredits / eligibleBattleDays * 100
   */
  calculateWarRate: function (
    totalBattleCredits: number,
    eligibleBattleDays: number,
  ): number {
    if (eligibleBattleDays <= 0) return 0; // Discovered-based: No days seen = 0%
    
    const rate = Math.round((totalBattleCredits / eligibleBattleDays) * 100);
    return Math.min(100, Math.max(0, rate));
  },

  /**
   * Calculates Raw Score and Final Performance Score (with Decay).
   *
   * @remarks
   * The weights represent the cultural values of the clan:
   * - Donations (50): High value on supporting others.
   * - War Rate (150): The absolute highest priority; participation is mandatory.
   * - Fame (3/15): Rewards consistent weekly activity.
   * - Trophies (0.1): Mostly useful as a tie-breaker for raw skill.
   */
  computeScores: function (
    currentFame: number,
    averageFame: number,
    weeklyDonations: number,
    trophies: number,
    warRateVal: number,
    lastSeenDate: number,
    now: number,
  ): { raw: number; perf: number } {
    const W =
      typeof CONFIG !== "undefined"
        ? CONFIG.LEADERBOARD.WEIGHTS
        : {
            FAME: 3,
            AVG_FAME: 15,
            DONATION: 50,
            TROPHY: 0.1,
            WAR_RATE: 150,
          };
    const P =
      typeof CONFIG !== "undefined"
        ? CONFIG.LEADERBOARD.PENALTIES
        : { INACTIVITY_GRACE_DAYS: 4, DECAY_RATE: 0.08 };

    const rawScore =
      currentFame * W.FAME +
      averageFame * (W.AVG_FAME || 0) +
      weeklyDonations * W.DONATION +
      trophies * W.TROPHY +
      warRateVal * (W.WAR_RATE || 0);

    const daysInactive = Math.max(
      0,
      (now - lastSeenDate) / (1000 * 60 * 60 * 24),
    );
    let finalScore = rawScore;

    if (daysInactive > P.INACTIVITY_GRACE_DAYS) {
      const decayDays = daysInactive - P.INACTIVITY_GRACE_DAYS;
      const decayFactor = Math.pow(1 - P.DECAY_RATE, decayDays);
      finalScore = rawScore * decayFactor;
    }

    return {
      raw: Math.round(rawScore),
      perf: Math.round(finalScore),
    };
  },

  /**
   * The Holy Grail Sorting Comparator.
   *
   * @remarks
   * Sorting Priority:
   * 1. Performance Score: Decayed score reflecting *current* impact.
   * 2. Raw Score: Undecayed total reflecting *historical* contribution.
   * 3. War Rate: Direct commitment metric.
   * 4. Donations/Trophies: Base activity tie-breakers.
   *
   * This ensures that a highly active new member can outrank a stale veteran,
   * while still honoring the veteran if they maintain activity.
   */
  comparator: function (rowA: (string | number)[], rowB: (string | number)[]): number {
    const L =
      typeof CONFIG !== "undefined"
        ? CONFIG.SCHEMA.LB
        : {
            PERF_SCORE: 13,
            RAW_SCORE: 12,
            WAR_RATE: 9,
            TOTAL_DON: 7,
            DAYS: 4,
            TROPHIES: 3,
          };

    // Priority 1: Current Performance (includes decay)
    const diffPerf = Number(rowB[L.PERF_SCORE]) - Number(rowA[L.PERF_SCORE]);
    if (diffPerf !== 0) return diffPerf;

    // Priority 2: Lifetime Contribution (tie-breaker for active members)
    const diffRaw = Number(rowB[L.RAW_SCORE]) - Number(rowA[L.RAW_SCORE]);
    if (diffRaw !== 0) return diffRaw;

    // Priority 3: Reliability (War Participation)
    const getWarVal = (r: any[]) => parseInt(r[L.WAR_RATE]) || 0;
    const diffWar = getWarVal(rowB) - getWarVal(rowA);
    if (diffWar !== 0) return diffWar;

    // Priority 4: Support (Donations)
    const diffDon = Number(rowB[L.TOTAL_DON]) - Number(rowA[L.TOTAL_DON]);
    if (diffDon !== 0) return diffDon;

    const diffDays = Number(rowA[L.DAYS]) - Number(rowB[L.DAYS]);
    if (diffDays !== 0) return diffDays;

    return Number(rowB[L.TROPHIES]) - Number(rowA[L.TROPHIES]);
  },

  /**
   * 🏗️ UNIFIED RAW SCORE (Recruit-Equivalent)
   */
  calculateRecruitRawScore: function (
    trophies: number,
    totalDonations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: ScoringWeights | null,
  ): number {
    const W = weights || { TROPHY: 1.0, DON: 0.07, WAR: 20.0 };
    const warBonus = hasRecentWar ? 500 : 0;
    const totalWarScore = (warDayWins || 0) + warBonus;

    return Math.round(
      (trophies || 0) * W.TROPHY +
        (totalDonations || 0) * W.DON +
        totalWarScore * W.WAR,
    );
  },

  /**
   * ⚖️ HYBRID BENCHMARK CALCULATOR (V7)
   *
   * @remarks
   * The Benchmark defines "100%" for potential scores.
   * It uses a hybrid model (40/60) to balance internal standards against
   * external market potential.
   *
   * Why 0.4 and 0.6?
   * - 0.4 (Clan Avg): Ensures we don't set the bar so high that recruitment
   *   becomes impossible if the clan is elite.
   * - 0.6 (Top 5% Blacklist): Sets a high bar based on the best available
   *   free agents seen recently.
   */
  calculateHybridBenchmark: function (
    clanScoredList: Array<{ rawScore: number; perfScore: number }>,
    blacklistScoredList: Array<{ rawScore: number }>,
  ): number {
    const clanPool = (clanScoredList || []).filter((c) => c.perfScore >= 50);
    const avgClanRef =
      clanPool.length > 0
        ? clanPool.reduce((a, b) => a + b.rawScore, 0) / clanPool.length
        : 0;

    // Get Top 5% of external candidates to represent "Elite Market Potential"
    const pool = [...(blacklistScoredList || [])].sort(
      (a, b) => b.rawScore - a.rawScore,
    );
    const poolSize = Math.max(3, Math.ceil(pool.length * 0.05));
    const topPool = pool.slice(0, poolSize);
    const topPoolAvg =
      topPool.length > 0
        ? topPool.reduce((a, b) => a + b.rawScore, 0) / topPool.length
        : 0;

    let finalBenchmark = 1;
    if (avgClanRef > 0 && topPoolAvg > 0) {
      finalBenchmark = avgClanRef * 0.4 + topPoolAvg * 0.6;
    } else if (avgClanRef > 0) {
      finalBenchmark = avgClanRef;
    } else if (topPoolAvg > 0) {
      finalBenchmark = topPoolAvg;
    }



    return Math.max(1, finalBenchmark);
  },

  /**
   * 🎯 POTENTIAL SCORE CALCULATOR
   */
  calculatePotentialScore: function (
    rawScore: number,
    benchmark: number,
  ): number {
    if (benchmark <= 0) return rawScore > 0 ? 100 : 0;
    const score = Math.round((rawScore / benchmark) * 100);
    return Math.min(100, score);
  },

  /**
   * ⚔️ UNIFIED WAR FAME RESOLVER
   */
  resolveWarFame: function (p: any): number {
    if (!p || typeof p !== "object") return 0;
    return Number(
      p.fame || p.medals || p.periodPoints || p.repairPoints || 0
    );
  },
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = ScoringSystem;
}

/**
 * 🌍 GLOBAL BRIDGE
 *
 * @remarks
 * In GAS, 'this' refers to the global scope. In Vitest/Node, it may be undefined.
 * We guard the assignment to ensure the module is testable in all environments.
 */
if (typeof this !== "undefined") {
  Object.assign(this as any, { ScoringSystem, VER_SCORING_SYSTEM });
}

export default ScoringSystem;
