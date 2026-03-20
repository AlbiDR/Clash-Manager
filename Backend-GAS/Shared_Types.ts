
/**
 * Shared types mirrored from Backend-Worker to satisfy GAS compiler rootDir constraints.
 */

export interface ScoringWeights {
  TROPHY: number;
  DON: number;
  WAR: number;
  WAR_BASELINE_BONUS?: number;
}

export interface RecruitingWeights {
  TROPHY: number;
  DON: number;
  WAR: number;
  WAR_BASELINE_BONUS?: number;
}

export interface RosterWeights {
  FAME: number;
  AVG_FAME: number;
  DONATION: number;
  TROPHY: number;
  WAR_RATE: number;
}

export interface PenaltiesConfig {
  INACTIVITY_GRACE_DAYS: number;
  DECAY_RATE: number;
  HERITAGE_DIVISOR: number;
}

export interface HeadhunterMathConfig {
  ELITE_THRESHOLD: number;
  REBUILD_MIN_PERCENTILE: number;
  BENCHMARK_CLAN_WEIGHT: number;
  BENCHMARK_MARKET_WEIGHT: number;
  percentile: number;
  decay: number;
  minPool: number;
}

export interface RosterSchemaIndex {
  PERF_SCORE: number;
  RAW_SCORE: number;
  WAR_RATE: number;
  TOTAL_DON: number;
  DAYS: number;
  TROPHIES: number;
}

export const VER_SHARED_TYPES = "1.0.0";

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VER_SHARED_TYPES };
}

(function(scope: any) {
  Object.assign(scope, { SharedTypes: { VER_SHARED_TYPES }, VER_SHARED_TYPES });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

