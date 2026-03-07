
/**
 * ============================================================================
 * MODULE: SCORING (Manager)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The Diplomat. Manages configuration and implementation choices,
 *    but delegates pure math to the Kernel.
 *  VERSION: 13.1.0
 * ============================================================================
 */

import { CONFIG } from "./Configuration";
import type { RecruitingWeights, ScoringWeights, RosterSchemaIndex, HeadhunterMathConfig } from "./SharedTypes"; // Fixed Import
import Registry from "./Registry";

// Global Version Constant
// @ts-ignore
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_SCORING = "13.1.0";

declare const module: any;

export interface ScoringContract {
  computeScores(
    currentFame: number,
    avgWarFame: number,
    dailyDonations: number,
    trophies: number,
    warRate: number,
    lastSeenDate: number,
    nowDate: number,
    cachedWins: number,
    isActiveMember: boolean,
    daysTracked: number
  ): { raw: number; perf: number };

  calculateRecruitRawScore(
    trophies: number,
    donations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: RecruitingWeights | null
  ): number;

  resolveWarFame(participant: any): number;

  calculateTrophyFloor(
    members: any[], 
    inGameReq: number,
    config: HeadhunterMathConfig
  ): { floor: number; method: string; mode: string };

  calculateHybridBenchmark(
    clanElite: Array<{ rawScore: number; perfScore: number }>,
    blacklist: Array<{ rawScore: number }>,
    config: HeadhunterMathConfig
  ): number;
  
  calculatePotentialScore(raw: number, benchmark: number): number;

  calculateWarRate(totalCredits: number, daysSeen: number): number;

  toStrictValue(val: any): number | string;

  comparator(a: any[], b: any[]): number;
}

const Scoring: ScoringContract = {

  calculateWarRate: function (
    totalCredits: number,
    daysSeen: number,
  ): number {
    return Registry.Services.ScoringKernel.calculateWarRate(totalCredits, daysSeen);
  },

  computeScores: function (
    currentFame: number,
    avgWarFame: number,
    dailyDonations: number,
    trophies: number,
    warRate: number,
    lastSeenDate: number,
    nowDate: number,
    cachedWins: number = 0,
    isActiveMember: boolean = false,
    daysTracked: number = 0,
  ): { raw: number; perf: number } {
    // 1. Gather Config
    const W = CONFIG.ROSTER.WEIGHTS;
    const P = CONFIG.ROSTER.PENALTIES;
    const sys = CONFIG.SYSTEM;
    const prophetThreshold = sys ? sys.PROPHET_TENURE_THRESHOLD : 10;

    // 2. Kernel: Calculate Roster Raw
    const rawScore = Registry.Services.ScoringKernel.calcRosterRaw(
        currentFame, avgWarFame, dailyDonations, trophies, warRate, W
    );

    // 3. Kernel: Apply Inactivity Decay
    const daysInactive = Math.max(0, (nowDate - lastSeenDate) / (1000 * 60 * 60 * 24));
    const decayedScore = Registry.Services.ScoringKernel.applyDecay(rawScore, daysInactive, P);

    // 4. Kernel: Calculate Heritage (Blessing)
    const recruitWeights = CONFIG.HEADHUNTER.WEIGHTS;
    const recruitRaw = Registry.Services.ScoringKernel.calcRecruitRaw(
        trophies, 0, cachedWins, isActiveMember, recruitWeights
    );
    
    const heritageBonus = Registry.Services.ScoringKernel.calcHeritage(
        recruitRaw, daysTracked, prophetThreshold, P.HERITAGE_DIVISOR
    );

    return {
      raw: Math.round(rawScore),
      perf: Math.round(decayedScore + heritageBonus),
    };
  },

  comparator: function (rowA: (string | number)[], rowB: (string | number)[]): number {
    const L = CONFIG.SCHEMA.ROSTER as unknown as RosterSchemaIndex;
    return Registry.Services.ScoringKernel.compareRosterRows(rowA, rowB, L);
  },

  calculateRecruitRawScore: function (
    trophies: number,
    totalDonations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: RecruitingWeights | null,
  ): number {
    const W = weights || { TROPHY: 1.0, DON: 0.07, WAR: 20.0 };
    return Registry.Services.ScoringKernel.calcRecruitRaw(trophies, totalDonations, warDayWins, hasRecentWar, W);
  },

  calculateHybridBenchmark: function (
    clanElite: Array<{ rawScore: number; perfScore: number }>,
    blacklist: Array<{ rawScore: number }>,
    config: HeadhunterMathConfig
  ): number {
    // 1. Calculate Clan Reference Average (Elite Roster)
    const clanPool = (clanElite || []).filter((c) => c.perfScore >= 50);
    const avgClanRef = clanPool.length > 0
        ? clanPool.reduce((a, b) => a + b.rawScore, 0) / clanPool.length
        : 0;

    // 2. Calculate Market Reference Average (Top 5% of Blacklist/Pool)
    const pool = [...(blacklist || [])].sort((a, b) => b.rawScore - a.rawScore);
    const poolSize = Math.max(3, Math.ceil(pool.length * 0.05));
    const topPool = pool.slice(0, poolSize);
    const topPoolAvg = topPool.length > 0
        ? topPool.reduce((a, b) => a + b.rawScore, 0) / topPool.length
        : 0;

    // 3. Delegate Blending to Kernel
    return Registry.Services.ScoringKernel.calcHybridBenchmark(avgClanRef, topPoolAvg, config);
  },

  calculatePotentialScore: function (raw: number, benchmark: number): number {
    return Registry.Services.ScoringKernel.calcPotential(raw, benchmark);
  },

  calculateTrophyFloor: function (members: any[], inGameReq: number, config: HeadhunterMathConfig): { floor: number; method: string; mode: string } {
    return Registry.Services.ScoringKernel.calcTrophyFloor(members, inGameReq, config);
  },

  resolveWarFame: function (p: any): number {
    if (!p || typeof p !== "object") return 0;
    return Number(p.fame || p.medals || p.periodPoints || p.repairPoints || 0);
  },

  /**
   * DATA PRIMITIVE: Normalizes values for Spreadsheet Purity.
   * Ensures numbers are actual integers and non-numeric states are strings.
   */
  toStrictValue: function (val: any): number | string {
    if (val === "N/A" || val === "-" || val === "" || val === null || val === undefined) return "N/A";
    const num = Number(val);
    return isNaN(num) ? "N/A" : num;
  },
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Scoring;
}

(function(scope: any) {
  Object.assign(scope, { Scoring, VER_SCORING });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Scoring;
