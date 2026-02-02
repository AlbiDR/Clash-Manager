
/**
 * Shared types mirrored from Backend-Worker to satisfy GAS compiler rootDir constraints.
 */

export interface ScoringWeights {
  TROPHY: number;
  DON: number;
  WAR: number;
}

export interface RecruitingWeights {
  TROPHY: number;
  DON: number;
  WAR: number;
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

/**
 * Interface representing the indices of the Roster sheet columns.
 * Matches the schema defined in Configuration.ts.
 */
export interface RosterSchemaIndex {
  TAG: number;
  NAME: number;
  ROLE: number;
  TROPHIES: number;
  DAYS: number;
  WEEKLY_REQ: number;
  AVG_DAY: number;
  TOTAL_DON: number;
  LAST_SEEN: number;
  WAR_RATE: number;
  AVG_WAR_FAME: number;
  HISTORY: number;
  RAW_SCORE: number;
  PERF_SCORE: number;
  TREND: number;
}

/**
 * Represents a single row in the Roster sheet.
 */
export type RosterRow = (string | number)[];

/**
 * Minimal interface for member objects required by trophy floor calculations.
 */
export interface MemberWithTrophies {
  trophies: number;
}

export const VER_SHARED_TYPES = "1.1.0";

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VER_SHARED_TYPES };
}

(function(scope: any) {
  Object.assign(scope, { SharedTypes: { VER_SHARED_TYPES } });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
