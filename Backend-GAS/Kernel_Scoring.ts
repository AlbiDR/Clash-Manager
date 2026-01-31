/**
 * ============================================================================
 * 🧠 MODULE: KERNEL SCORING (Pure Math Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The isolated mathematical heart of the application.
 * ⚙️ ROLE: Pure Functions only. No side effects. No external dependencies.
 * 🔒 STATUS: CORE ARCHITECTURE.
 * ============================================================================
 */

import type { ScoringWeights, RosterWeights, PenaltiesConfig, RosterSchemaIndex } from "./SharedTypes";

// Global Version Constant
// @ts-ignore
const VER_KERNEL_SCORING = "1.0.0";

export interface IKernelScoring {
  calcWarRate(credits: number, days: number): number;
  calcRecruitRaw(trophies: number, dons: number, wins: number, recentWar: boolean, w: ScoringWeights): number;
  calcRosterRaw(
    fame: number, 
    avgFame: number, 
    dons: number, 
    trophies: number, 
    warRate: number, 
    w: RosterWeights
  ): number;
  applyDecay(score: number, daysInactive: number, p: PenaltiesConfig): number;
  calcHeritage(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number;
  calcPotential(raw: number, benchmark: number): number;
  calcHybridBenchmark(clanAvg: number, marketAvg: number): number;
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number;
}

const KernelScoring: IKernelScoring = {

  /**
   * ⚔️ War Participation Rate
   */
  calcWarRate(credits: number, days: number): number {
    if (days <= 0) return 0;
    const r = Math.round((credits / days) * 100);
    return Math.min(100, Math.max(0, r));
  },

  /**
   * 🏗️ Recruit Raw Score
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
   * 🏆 Roster Raw Score
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
   * 📉 Inactivity Decay
   */
  applyDecay(score: number, daysInactive: number, p: PenaltiesConfig): number {
    if (daysInactive <= p.INACTIVITY_GRACE_DAYS) return score;
    
    const decayDays = daysInactive - p.INACTIVITY_GRACE_DAYS;
    // P.DECAY_RATE is e.g. 0.08 (8%)
    const factor = Math.pow(1 - p.DECAY_RATE, decayDays);
    return score * factor;
  },

  /**
   * ✨ Induction "Heritage" Blessing
   * Quadratic decay of a "potential" bonus for new members.
   */
  calcHeritage(recruitRaw: number, tenureDays: number, threshold: number, divisor: number): number {
    if (threshold <= 0) return 0; // Config safety
    
    const timeRatio = Math.min(1, Math.max(0, (threshold - tenureDays) / threshold));
    const factor = timeRatio * timeRatio;
    
    // The blessing is derived from their "Recruit Potential" (Skill + War)
    return Math.round((recruitRaw * factor) / divisor);
  },

  /**
   * 🎯 Potential Score (vs Benchmark)
   */
  calcPotential(raw: number, benchmark: number): number {
    if (benchmark <= 0) return raw > 0 ? 100 : 0;
    const s = Math.round((raw / benchmark) * 100);
    return Math.min(100, s);
  },

  /**
   * ⚖️ Hybrid Benchmark
   * 40% Internal Clan Avg / 60% External Market Top 5%
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
   * 🏅 Comparator
   */
  compareRosterRows(a: any[], b: any[], idx: RosterSchemaIndex): number {
    // 1. Performance
    const dPerf = Number(b[idx.PERF_SCORE]) - Number(a[idx.PERF_SCORE]);
    if (dPerf !== 0) return dPerf;

    // 2. Raw (Lifetime)
    const dRaw = Number(b[idx.RAW_SCORE]) - Number(a[idx.RAW_SCORE]);
    if (dRaw !== 0) return dRaw;

    // 3. War Rate
    const getWar = (r: any[]) => Number(r[idx.WAR_RATE]) || 0;
    const dWar = getWar(b) - getWar(a);
    if (dWar !== 0) return dWar;

    // 4. Donations
    const dDon = Number(b[idx.TOTAL_DON]) - Number(a[idx.TOTAL_DON]);
    if (dDon !== 0) return dDon;

    // 5. Days (Newer is better if all else equal? Or older? Original: A-B => Lower Days wins (Newer))
    const dDays = Number(a[idx.DAYS]) - Number(b[idx.DAYS]);
    if (dDays !== 0) return dDays;

    return Number(b[idx.TROPHIES]) - Number(a[idx.TROPHIES]);
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = KernelScoring;
}

// 🌍 Global Bridge for GAS
(function(scope: any) {
  Object.assign(scope, { KernelScoring, VER_KERNEL_SCORING });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default KernelScoring;
