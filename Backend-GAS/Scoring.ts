
/**
 * ============================================================================
 * 🧠 MODULE: SCORING (Manager)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The Diplomat. Manages configuration and implementation choices,
 *    but delegates pure math to the Kernel.
 * 🏷️ VERSION: 14.0.0
 * ============================================================================
 */

import { CONFIG } from "./Configuration";
import type {
  RecruitingWeights,
  ScoringWeights,
  RosterSchemaIndex,
  RosterRow,
  MemberWithTrophies
} from "./SharedTypes";
import Registry from "./Registry";

// Global Version Constant
const VER_SCORING = "14.0.0";

declare const module: any;

export interface IScoring {
  /**
   * Orchestrates score calculation for roster members.
   */
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

  /**
   * Wrapper for recruitment raw score calculation.
   */
  calculateRecruitRawScore(
    trophies: number,
    donations: number,
    warDayWins: number,
    hasRecentWar: boolean,
    weights: RecruitingWeights | null
  ): number;

  /**
   * Resolves war fame from a participant object.
   */
  resolveWarFame(participant: Record<string, any> | null): number;

  /**
   * Wrapper for trophy floor calculation.
   */
  calculateTrophyFloor(
    members: MemberWithTrophies[],
    inGameReq: number
  ): { floor: number; method: string; mode: string };

  /**
   * Wrapper for hybrid benchmark calculation.
   */
  calculateHybridBenchmark(
    clanElite: Array<{ rawScore: number; perfScore: number }>,
    blacklist: Array<{ rawScore: number }>,
    minpoolFromConfig?: number
  ): number;
  
  /**
   * Wrapper for potential score calculation.
   */
  calculatePotentialScore(raw: number, benchmark: number): number;

  /**
   * Wrapper for war rate calculation.
   */
  calculateWarRate(totalCredits: number, daysSeen: number): number;

  /**
   * Comparator for roster rows.
   */
  comparator(a: RosterRow, b: RosterRow): number;
}

const Scoring: IScoring = {

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
    const recruitWeights: RecruitingWeights = { TROPHY: 1.0, DON: 0.07, WAR: 20.0 };

    // FIX: Pass isActiveMember as hasRecentWar to correctly apply the activity bonus
    // for roster members who are being evaluated for heritage status.
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

  comparator: function (rowA: RosterRow, rowB: RosterRow): number {
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
    minpoolFromConfig?: number
  ): number {
    const minPoolTarget = minpoolFromConfig || CONFIG.HEADHUNTER.TARGET;
    
    const clanPool = (clanElite || []).filter((c) => c.perfScore >= 50);
    const avgClanRef = clanPool.length > 0
        ? clanPool.reduce((a, b) => a + b.rawScore, 0) / clanPool.length
        : 0;

    const pool = [...(blacklist || [])].sort((a, b) => b.rawScore - a.rawScore);
    const poolSize = Math.max(3, Math.ceil(pool.length * 0.05));
    const topPool = pool.slice(0, poolSize);
    const topPoolAvg = topPool.length > 0
        ? topPool.reduce((a, b) => a + b.rawScore, 0) / topPool.length
        : 0;

    return Registry.Services.ScoringKernel.calcHybridBenchmark(avgClanRef, topPoolAvg);
  },

  calculatePotentialScore: function (raw: number, benchmark: number): number {
    return Registry.Services.ScoringKernel.calcPotential(raw, benchmark);
  },

  calculateTrophyFloor: function (members: MemberWithTrophies[], inGameReq: number): { floor: number; method: string; mode: string } {
    return Registry.Services.ScoringKernel.calcTrophyFloor(members, inGameReq);
  },

  resolveWarFame: function (p: Record<string, any> | null): number {
    if (!p) return 0;
    return Number(p.fame || p.medals || p.periodPoints || p.repairPoints || 0);
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
