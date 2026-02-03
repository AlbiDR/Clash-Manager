/**
 * ============================================================================
 * MODULE: KERNEL SCORING (Pure Math Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The isolated mathematical heart of the application.
 * ROLE: Pure Functions only. No side effects. No external dependencies.
 * STATUS: CORE ARCHITECTURE.
 * ============================================================================
 */

import type { RosterWeights, ScoringWeights, PenaltiesConfig, RosterSchemaIndex } from "./SharedTypes";

declare var module: any;

/**
 * @remarks
 * The Scoring Kernel version tracks breaking changes in the mathematical
 * formulas. V1.0.0 represents the initial stabilized pure-math extraction.
 */
const VER_SCORING_KERNEL = "1.0.0"; 

/**
 * Interface for the Scoring Kernel.
 * Defines the mathematical contract for roster and recruitment scoring.
 */
export interface IScoringKernel { 
  /**
   * Orchestrates the calculation of raw and performance scores for a member.
   *
   * @param currentFame - Fame earned in the current period.
   * @param avgWarFame - Historical average fame.
   * @param dailyDonations - Daily donation contribution.
   * @param trophies - Current trophy count.
   * @param warRate - Calculated war participation rate.
   * @param lastSeenDate - Epoch timestamp of last activity.
   * @param nowDate - Current epoch timestamp.
   * @param cachedWins - Historical war wins.
   * @param isActiveMember - Boolean flag for current membership status.
   * @param daysTracked - Total days the player has been in the system.
   * @param weights - Scoring weights for roster metrics.
   * @param penalties - Configuration for inactivity decay.
   * @returns Object containing 'raw' (lifetime) and 'perf' (momentum) scores.
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
    daysTracked: number,
    weights: RosterWeights,
    penalties: PenaltiesConfig
  ): { raw: number; perf: number };

  /**
   * Calculates the raw recruitment score for a candidate.
   */
  calcRecruitRaw(trophies: number, dons: number, wins: number, recentWar: boolean, w: ScoringWeights): number;

  /**
   * Calculates the base roster score for an internal member.
   */
  calcRosterRaw(fame: number, avgFame: number, dons: number, trophies: number, warRate: number, w: RosterWeights): number;

  /**
   * Applies exponential decay to a score based on inactivity duration.
   */
  applyDecay(score: number, daysInactive: number, p: PenaltiesConfig): number;

  /**
   * Calculates the "Heritage" bonus for newly recruited members.
   */
  calcHeritage(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number;

  /**
   * Normalizes a raw score against a benchmark to produce a potential percentage.
   */
  calcPotential(raw: number, benchmark: number): number;

  /**
   * Calculates a hybrid benchmark by blending clan performance with market standards.
   */
  calcHybridBenchmark(clanAvg: number, marketAvg: number): number;

  /**
   * Determines the optimal trophy floor strategy based on clan composition.
   */
  calcTrophyFloor(members: { trophies: number }[], inGameReq: number): { floor: number; method: string; mode: "ELITE" | "REBUILD" | "BASE" };

  /**
   * Standard comparator for sorting roster rows by performance and reliability.
   */
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number;

  /**
   * Calculates the percentage of war participation.
   */
  calculateWarRate(totalCredits: number, daysSeen: number): number;
}

const ScoringKernel: IScoringKernel = {

  /**
   * @remarks
   * This is the primary entry point for roster scoring. It separates 'Raw'
   * (lifetime achievement) from 'Performance' (current momentum).
   */
  computeScores(
    currentFame: number,
    avgWarFame: number,
    dailyDonations: number,
    trophies: number,
    warRate: number,
    lastSeenDate: number,
    nowDate: number,
    _cachedWins: number,
    isActiveMember: boolean,
    _daysTracked: number,
    weights: RosterWeights,
    penalties: PenaltiesConfig
  ): { raw: number; perf: number } {
    
    const raw = this.calcRosterRaw(
      currentFame, 
      avgWarFame, 
      dailyDonations, 
      trophies, 
      warRate, 
      weights
    );

    const daysInactive = Math.max(0, (nowDate - lastSeenDate) / (1000 * 60 * 60 * 24));
    const decayed = isActiveMember ? raw : this.applyDecay(raw, daysInactive, penalties);

    // Intent: Performance score defaults to decayed raw score.
    // Heritage/Tenure logic is managed by the caller in the current architecture
    // to keep the kernel decoupled from specific system thresholds.
    let perf = decayed;
    
    return { raw, perf };
  },

  /**
   * Calculates the percentage of war participation.
   */
  calculateWarRate(totalCredits: number, daysSeen: number): number {
    if (daysSeen <= 0) return 0;
    const r = Math.round((totalCredits / daysSeen) * 100);
    return Math.min(100, Math.max(0, r));
  },

  /**
   * Calculates the raw recruitment score.
   *
   * @remarks
   * Uses a 'warBonus' of 500 to provide a baseline credit for recent activity.
   * This prevents active players with low win counts from being penalized
   * too heavily compared to inactive players with high historical wins.
   */
  calcRecruitRaw(trophies: number, dons: number, wins: number, recentWar: boolean, w: ScoringWeights): number {
    const warBonus = recentWar ? 500 : 0;
    const totalWar = (wins || 0) + warBonus;
    return Math.round(
      (trophies || 0) * w.TROPHY +
      (dons || 0) * w.DON +
      totalWar * w.WAR
    );
  },

  /**
   * Calculates the base roster score.
   */
  calcRosterRaw(fame: number, avgFame: number, dons: number, trophies: number, warRate: number, w: RosterWeights): number {
    return (
      fame * w.FAME +
      avgFame * w.AVG_FAME +
      dons * w.DONATION +
      trophies * w.TROPHY +
      warRate * w.WAR_RATE
    );
  },

  /**
   * Applies inactivity decay.
   *
   * @remarks
   * Implements exponential decay after a grace period.
   * Formula: score * (1 - decayRate) ^ (daysInactive - graceDays)
   */
  applyDecay(score: number, daysInactive: number, p: PenaltiesConfig): number {
    if (daysInactive <= p.INACTIVITY_GRACE_DAYS) return score;
    
    const decayDays = daysInactive - p.INACTIVITY_GRACE_DAYS;
    const factor = Math.pow(1 - p.DECAY_RATE, decayDays);
    return score * factor;
  },

  /**
   * Calculates the induction "Heritage" blessing.
   *
   * @remarks
   * Uses a quadratic curve to phase out the recruitment bonus over time.
   * This ensures newly joined members maintain high visibility until their
   * internal stats stabilize.
   */
  calcHeritage(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number {
    if (threshold <= 0) return 0;
    const timeRatio = Math.min(1, Math.max(0, (threshold - tenureDays) / threshold));
    const factor = timeRatio * timeRatio;
    return Math.round((recruitRaw * factor) / (divisor || 5));
  },

  /**
   * Calculates the Potential Score relative to a benchmark.
   */
  calcPotential(raw: number, benchmark: number): number {
    if (benchmark <= 0) return 0;
    const s = Math.round((raw / benchmark) * 100);
    return Math.min(100, s);
  },

  /**
   * Calculates a blended benchmark.
   *
   * @remarks
   * Uses a 0.4/0.6 split to prioritize market standards (Global) over
   * internal clan performance. This prevents the "Echo Chamber" effect
   * where a weak clan's standards drop too low to find elite recruits.
   */
  calcHybridBenchmark(clanAvg: number, marketAvg: number): number {
    let b = 1;
    if (clanAvg > 0 && marketAvg > 0) {
      b = clanAvg * 0.4 + marketAvg * 0.6;
    } else if (clanAvg > 0) {
      b = clanAvg;
    } else if (marketAvg > 0) {
      b = marketAvg;
    }
    return Math.max(1, b);
  },

  /**
   * Calculates the optimal trophy floor.
   *
   * @remarks
   * 'ELITE_THRESHOLD' (41) is the critical mass required for a competitive clan.
   * Above this, the median is used to filter out bottom-tier performers.
   * Below this, the bottom 10% average is used to support rebuilding efforts.
   */
  calcTrophyFloor(members: { trophies: number }[], inGameReq: number): { floor: number; method: string; mode: "ELITE" | "REBUILD" | "BASE" } {
    const ELITE_THRESHOLD = 41;
    let floor = inGameReq;
    let method = "In-Game Requirement";
    let mode: "ELITE" | "REBUILD" | "BASE" = "BASE";

    if (members.length > 0) {
      const ts = members.map(m => m.trophies || 0).sort((a,b) => a - b);
      if (members.length > ELITE_THRESHOLD) {
        mode = "ELITE";
        const median = ts[Math.floor(ts.length / 2)] ?? 0;
        if (median > floor) {
          floor = Math.min(9000, median);
          method = `Elite Mode (Median: ${floor})`;
        } else {
          method = `Elite Mode (At In-Game Cap: ${inGameReq})`;
        }
      } else {

        mode = "REBUILD";
        const bCount = Math.max(1, Math.ceil(ts.length * 0.1));
        const bAvg = Math.round(ts.slice(0, bCount).reduce((a,b) => a + b, 0) / bCount);
        if (bAvg > floor) {
          floor = bAvg;
          method = `Rebuild Mode (Bot 10% Avg: ${bAvg})`;
        } else {
          method = `Rebuild Mode (At In-Game Cap: ${inGameReq})`;
        }
      }
    }
    return { floor, method, mode };
  },

  /**
   * Standard comparator for roster sorting.
   *
   * @remarks
   * Priority:
   * 1. Performance Score (Momentum)
   * 2. Raw Score (Lifetime)
   * 3. War Participation Rate (Reliability)
   * 4. Total Donations (Contribution)
   * 5. Days Tracked (Newer players win ties)
   */
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number {
    const dPerf = Number(b[idx.PERF_SCORE]) - Number(a[idx.PERF_SCORE]);
    if (dPerf !== 0) return dPerf;

    const dRaw = Number(b[idx.RAW_SCORE]) - Number(a[idx.RAW_SCORE]);
    if (dRaw !== 0) return dRaw;

    const getWar = (r: any[]) => Number(r[idx.WAR_RATE]) || 0;
    const dWar = getWar(b) - getWar(a);
    if (dWar !== 0) return dWar;

    const dDon = Number(b[idx.TOTAL_DON]) - Number(a[idx.TOTAL_DON]);
    if (dDon !== 0) return dDon;

    const dDays = Number(a[idx.DAYS]) - Number(b[idx.DAYS]);
    if (dDays !== 0) return dDays;

    return Number(b[idx.TROPHIES]) - Number(a[idx.TROPHIES]);
  }
};

// Global exports for Google Apps Script and Node.js environments
// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = ScoringKernel;
}

(function(scope: any) {
  Object.assign(scope, { ScoringKernel, VER_SCORING_KERNEL });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default ScoringKernel;
