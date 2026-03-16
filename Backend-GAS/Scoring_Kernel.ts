/**
 * ============================================================================
 * MODULE: KERNEL SCORING (Pure Math Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The isolated mathematical heart of the application.
 * ROLE: Pure Functions only. No side effects. No external dependencies.
 * STATUS: CORE ARCHITECTURE.
 * VERSION: 13.1.0
 * ============================================================================
 */

import type { RosterWeights, ScoringWeights, PenaltiesConfig, RosterSchemaIndex, HeadhunterMathConfig } from "./Shared_Types";

declare var module: any;

/**
 * @remarks
 * The Scoring Kernel version tracks breaking changes in the mathematical
 * formulas. V1.0.0 represents the initial stabilized pure-math extraction.
 */
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_SCORING_KERNEL = "13.1.0";

/**
 * Interface for the Scoring Kernel.
 * Defines the mathematical contract for roster and recruitment scoring.
 */
export interface ScoringKernelContract { 
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
   * Calculates the RPoS (Raw Potential Score) for a recruit candidate.
   */
  computeRecruitScore(trophies: number, dons: number, wins: number, recentWar: boolean, w: ScoringWeights): number;

  /**
   * Calculates the RPeS (Raw Performance Score) for a roster member.
   */
  computeRosterRawScore(fame: number, avgFame: number, dons: number, trophies: number, warRate: number, w: RosterWeights): number;

  /**
   * Applies exponential decay to a score based on inactivity duration.
   */
  applyDecay(score: number, daysInactive: number, p: PenaltiesConfig): number;

  /**
   * Calculates the "Heritage" bonus for newly recruited members.
   */
  applyTenureBonus(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number;

  /**
   * Normalizes a raw score against a benchmark to produce a potential percentage.
   */
  computePotentialPercentage(raw: number, benchmark: number): number;

  /**
   * Calculates a hybrid benchmark by blending clan performance with market standards.
   */
  computeHybridBenchmark(clanAvg: number, marketAvg: number, config: HeadhunterMathConfig): number;

  /**
   * Determines the optimal trophy floor strategy based on clan composition.
   */
  evaluateTrophyStrategy(members: { trophies: number }[], inGameReq: number, config: HeadhunterMathConfig): { floor: number; method: string; mode: "ELITE" | "REBUILD" | "BASE" };

  /**
   * Standard comparator for sorting roster rows by performance and reliability.
   */
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number;

  /**
   * Calculates the percentage of war participation.
   */
  calculateWarRate(totalCredits: number, daysSeen: number): number;
}

const ScoringKernel: ScoringKernelContract = {

  /**
   * @remarks
   * Primary entry point for roster scoring. Returns RPeS (Raw Performance Score)
   * and PeS (Performance Score).
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
    
    const raw = this.computeRosterRawScore(
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
   * Calculates the RPoS (Raw Potential Score).
   *
   * @remarks
   * Uses a 'warBonus' of 500 to provide a baseline credit for recent activity.
   * This prevents active players with low win counts from being penalized
   * too heavily compared to inactive players with high historical wins.
   */
  computeRecruitScore(trophies: number, dons: number, wins: number, recentWar: boolean, w: ScoringWeights): number {
    const warBonus = recentWar ? (w.WAR_BASELINE_BONUS || 500) : 0;
    const totalWar = (wins || 0) + warBonus;
    return Math.round(
      (trophies || 0) * w.TROPHY +
      (dons || 0) * w.DON +
      totalWar * w.WAR
    );
  },

  /**
   * Calculates the RPeS (Raw Performance Score).
   */
  computeRosterRawScore(fame: number, avgFame: number, dons: number, trophies: number, warRate: number, w: RosterWeights): number {
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
  applyTenureBonus(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number {
    if (threshold <= 0) return 0;
    const timeRatio = Math.min(1, Math.max(0, (threshold - tenureDays) / threshold));
    const factor = timeRatio * timeRatio;
    return Math.round((recruitRaw * factor) / (divisor || 5));
  },

  /**
   * Calculates the PeS (Performance Score) or PoS (Potential Score) relative to a benchmark.
   */
  computePotentialPercentage(raw: number, benchmark: number): number {
    if (benchmark <= 0) return 0;
    const s = Math.round((raw / benchmark) * 100);
    return Math.min(100, s);
  },

  /**
   * Calculates a blended benchmark.
   *
   * @remarks
   * Uses a blended split to prioritize market standards (Global) over
   * internal clan performance. This prevents the "Echo Chamber" effect
   * where a weak clan's standards drop too low to find elite recruits.
   */
  computeHybridBenchmark(clanAvg: number, marketAvg: number, config: HeadhunterMathConfig): number {
    let b = 1;
    if (clanAvg > 0 && marketAvg > 0) {
      b = clanAvg * config.BENCHMARK_CLAN_WEIGHT + marketAvg * config.BENCHMARK_MARKET_WEIGHT;
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
   * Below this, the bottom percentile average is used to support rebuilding efforts.
   */
  evaluateTrophyStrategy(members: { trophies: number }[], inGameReq: number, config: HeadhunterMathConfig): { floor: number; method: string; mode: "ELITE" | "REBUILD" | "BASE" } {
    const ELITE_THRESHOLD = config.ELITE_THRESHOLD;
    
    let floor = inGameReq;
    let method = "In-Game Requirement";
    let mode: "ELITE" | "REBUILD" | "BASE" = "BASE";

    if (members.length > 0) {
      const ts = members.map(m => m.trophies || 0).sort((a,b) => a - b);
      if (members.length > ELITE_THRESHOLD) {
        mode = "ELITE";
        const median = ts[Math.floor(ts.length / 2)] ?? 0;
        if (median > floor) {
          floor = median;
          method = `Elite Mode (Median: ${floor})`;
        } else {
          method = `Elite Mode (At In-Game Cap: ${inGameReq})`;
        }
      } else {
        mode = "REBUILD";
        const bCount = Math.max(1, Math.ceil(ts.length * config.REBUILD_MIN_PERCENTILE));
        const bAvg = Math.round(ts.slice(0, bCount).reduce((a,b) => a + b, 0) / bCount);
        if (bAvg > floor) {
          floor = bAvg;
          method = `Rebuild Mode (Bot ${Math.round(config.REBUILD_MIN_PERCENTILE * 100)}% Avg: ${bAvg})`;
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
   * 1. PeS (Performance Score) [Momentum]
   * 2. RPeS (Raw Performance Score) [Lifetime]
   * 3. War Participation Rate (Reliability)
   * 4. Total Donations (Contribution)
   * 5. Days Tracked (Newer players win ties)
   *
   * Performance: Optimized to minimize redundant Number() conversions during O(N log N) sorts.
   */
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number {
    // 1. PeS (Performance Score)
    const bPerf = Number(b[idx.PERF_SCORE]) || 0;
    const aPerf = Number(a[idx.PERF_SCORE]) || 0;
    const dPerf = bPerf - aPerf;
    if (dPerf !== 0) return dPerf;

    // 2. RPeS (Raw Performance Score)
    const bRaw = Number(b[idx.RAW_SCORE]) || 0;
    const aRaw = Number(a[idx.RAW_SCORE]) || 0;
    const dRaw = bRaw - aRaw;
    if (dRaw !== 0) return dRaw;

    // 3. War Participation Rate (Reliability)
    const bWar = Number(b[idx.WAR_RATE]) || 0;
    const aWar = Number(a[idx.WAR_RATE]) || 0;
    const dWar = bWar - aWar;
    if (dWar !== 0) return dWar;

    // 4. Total Donations (Contribution)
    const bDon = Number(b[idx.TOTAL_DON]) || 0;
    const aDon = Number(a[idx.TOTAL_DON]) || 0;
    const dDon = bDon - aDon;
    if (dDon !== 0) return dDon;

    // 5. Days Tracked (Ascending: Newer players win ties to encourage growth)
    const bDays = Number(b[idx.DAYS]) || 0;
    const aDays = Number(a[idx.DAYS]) || 0;
    const dDays = aDays - bDays; // Ascending
    if (dDays !== 0) return dDays;

    // 6. Trophies (Final Tie-breaker)
    const bTrophies = Number(b[idx.TROPHIES]) || 0;
    const aTrophies = Number(a[idx.TROPHIES]) || 0;
    return bTrophies - aTrophies;
  }
};

// Global exports for Google Apps Script and Node.js environments
// @ts-ignore
try { if (typeof module !== "undefined" && module.exports) { module.exports = ScoringKernel; } } catch (e) {}

(function(scope: any) {
  Object.assign(scope, { ScoringKernel, VER_SCORING_KERNEL });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default ScoringKernel;
