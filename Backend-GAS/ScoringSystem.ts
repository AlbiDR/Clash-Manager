
/**
 * ============================================================================
 * 🧠 MODULE: SCORING SYSTEM (CORE ENGINE)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The mathematical heart of the application.
 * ⚙️ ROLE: Pure Logic. Accepts raw data -> Returns Scores & Sort Orders.
 * 🔒 STATUS: PROTECTED "DO NOT MODIFY" ZONE.
 * 🏷️ VERSION: 13.0.0
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
const VER_SCORING_SYSTEM = "13.0.0";

declare const module: any;

// Define the scoring configuration interface
export interface ScoringConfig {
  SYSTEM: {
    PROPHET_TENURE_THRESHOLD: number;
  };
  ROSTER: {
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
      HERITAGE_DIVISOR: number;
    };
  };
  SCHEMA: {
    ROSTER: {
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
    warDayWins?: number,
    hasRecentWar?: boolean,
    tenureDays?: number,
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
   * Delegates to Kernel.
   */
  calculateWarRate: function (
    totalBattleCredits: number,
    eligibleBattleDays: number,
  ): number {
    return Registry.Services.KernelScoring.calcWarRate(totalBattleCredits, eligibleBattleDays);
  },

  /**
   * Calculates Raw Score and Final Performance Score (with Decay).
   * Now aggregates Config and delegates to Kernel.
   */
  computeScores: function (
    currentFame: number,
    averageFame: number,
    weeklyDonations: number,
    trophies: number,
    warRateVal: number,
    lastSeenDate: number,
    now: number,
    warDayWins: number = 0,
    hasRecentWar: boolean = false,
    tenureDays: number = 0,
  ): { raw: number; perf: number } {
    // 1. Gather Config
    const W = (typeof CONFIG !== "undefined" ? CONFIG.ROSTER.WEIGHTS : {
            FAME: 3, AVG_FAME: 15, DONATION: 50, TROPHY: 0.1, WAR_RATE: 150
          });
    
    const P = (typeof CONFIG !== "undefined" && (CONFIG as any).ROSTER) ? CONFIG.ROSTER.PENALTIES
        : { INACTIVITY_GRACE_DAYS: 4, DECAY_RATE: 0.08, HERITAGE_DIVISOR: 5 };

    const sys = (typeof CONFIG !== "undefined" && (CONFIG as any).SYSTEM) ? CONFIG.SYSTEM : {};
    const prophetThreshold = sys.PROPHET_TENURE_THRESHOLD || 10;

    // 2. Kernel: Calculate Roster Raw
    const rawScore = Registry.Services.KernelScoring.calcRosterRaw(
        currentFame, averageFame, weeklyDonations, trophies, warRateVal, W
    );

    // 3. Kernel: Apply Inactivity Decay
    const daysInactive = Math.max(0, (now - lastSeenDate) / (1000 * 60 * 60 * 24));
    const decayedScore = Registry.Services.KernelScoring.applyDecay(rawScore, daysInactive, P);

    // 4. Kernel: Calculate Heritage (Blessing)
    // Needs a Recruit-Strict Raw Score calculation first to match "Recruit Potential"
    const recruitWeights = { TROPHY: 1.0, DON: 0.07, WAR: 20.0 }; // Standard Headhunter Weights
    const recruitRaw = Registry.Services.KernelScoring.calcRecruitRaw(
        trophies, 0, warDayWins, hasRecentWar, recruitWeights
    );
    
    const heritageBonus = Registry.Services.KernelScoring.calcHeritage(
        recruitRaw, tenureDays, prophetThreshold, P.HERITAGE_DIVISOR
    );

    return {
      raw: Math.round(rawScore),
      perf: Math.round(decayedScore + heritageBonus),
    };
  },

  /**
   * The Holy Grail Sorting Comparator.
   * Delegates to Kernel.
   */
  comparator: function (rowA: (string | number)[], rowB: (string | number)[]): number {
    const L = (typeof CONFIG !== "undefined" ? CONFIG.SCHEMA.ROSTER : {
            PERF_SCORE: 13, RAW_SCORE: 12, WAR_RATE: 9, TOTAL_DON: 7, DAYS: 4, TROPHIES: 3
    });
    return Registry.Services.KernelScoring.compareRosterRows(rowA, rowB, L);
  },

  /**
   * 🏗️ UNIFIED RAW SCORE (Recruit-Equivalent)
   * Delegates to Kernel.
   */
  calculateRecruitRawScore: function (
    trophies: number,
    totalDonations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: ScoringWeights | null,
  ): number {
    const W = weights || { TROPHY: 1.0, DON: 0.07, WAR: 20.0 };
    return Registry.Services.KernelScoring.calcRecruitRaw(trophies, totalDonations, warDayWins, hasRecentWar, W);
  },

  /**
   * ⚖️ HYBRID BENCHMARK CALCULATOR
   * Delegates to Kernel.
   */
  calculateHybridBenchmark: function (
    clanScoredList: Array<{ rawScore: number; perfScore: number }>,
    blacklistScoredList: Array<{ rawScore: number }>,
  ): number {
    // Prepare Data for Kernel (which expects simple averages)
    const clanPool = (clanScoredList || []).filter((c) => c.perfScore >= 50);
    const avgClanRef = clanPool.length > 0
        ? clanPool.reduce((a, b) => a + b.rawScore, 0) / clanPool.length
        : 0;

    const pool = [...(blacklistScoredList || [])].sort((a, b) => b.rawScore - a.rawScore);
    const poolSize = Math.max(3, Math.ceil(pool.length * 0.05));
    const topPool = pool.slice(0, poolSize);
    const topPoolAvg = topPool.length > 0
        ? topPool.reduce((a, b) => a + b.rawScore, 0) / topPool.length
        : 0;

    return Registry.Services.KernelScoring.calcHybridBenchmark(avgClanRef, topPoolAvg);
  },

  /**
   * 🎯 POTENTIAL SCORE CALCULATOR
   * Delegates to Kernel.
   */
  calculatePotentialScore: function (rawScore: number, benchmark: number): number {
    return Registry.Services.KernelScoring.calcPotential(rawScore, benchmark);
  },

  /**
   * ⚔️ UNIFIED WAR FAME RESOLVER
   * Helper remains here as it's object-traversal logic, not pure math.
   */
  resolveWarFame: function (p: any): number {
    if (!p || typeof p !== "object") return 0;
    return Number(p.fame || p.medals || p.periodPoints || p.repairPoints || 0);
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
(function(scope: any) {
  Object.assign(scope, { ScoringSystem, VER_SCORING_SYSTEM });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default ScoringSystem;
