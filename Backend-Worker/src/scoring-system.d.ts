/**
 * TypeScript Type Definitions for Backend-GAS/ScoringSystem.js
 *
 * This provides type safety for the shared JavaScript module used by both
 * Backend-Worker (Node.js) and Backend-GAS (Google Apps Script).
 */

declare module "../Backend-GAS/ScoringSystem.js" {
  export interface ScoringWeights {
    TROPHY: number;
    DON: number;
    WAR: number;
  }

  export interface LeaderboardWeights {
    FAME: number;
    AVG_FAME: number;
    DONATION: number;
    TROPHY: number;
    WAR_RATE: number;
  }

  export interface PenaltyConfig {
    INACTIVITY_GRACE_DAYS: number;
    DECAY_RATE: number;
  }

  export interface ScoreResult {
    raw: number;
    perf: number;
  }

  export interface ScoredPlayer {
    rawScore: number;
    perfScore?: number;
  }

  export interface ScoringSystemModule {
    /**
     * Calculates the War Participation Rate
     */
    calculateWarRate(
      warHistoryMap: Map<string, number>,
      daysTracked: number,
      currentWeekId: string,
      currentDayIndex: number,
    ): number;

    /**
     * Calculates Raw Score and Final Performance Score with Decay
     */
    computeScores(
      currentFame: number,
      averageFame: number,
      weeklyDonations: number,
      trophies: number,
      warRateVal: number,
      lastSeenDate: Date,
      now: Date,
    ): ScoreResult;

    /**
     * Sorting comparator for leaderboard
     */
    comparator(rowA: unknown[], rowB: unknown[]): number;

    /**
     * Calculates unified raw score for recruits
     */
    calculateRecruitRawScore(
      trophies: number,
      totalDonations: number,
      warDayWins: number,
      hasRecentWar: boolean,
      weights: ScoringWeights | null,
    ): number;

    /**
     * Calculates hybrid benchmark from clan and blacklist data
     */
    calculateHybridBenchmark(
      clanScoredList: ScoredPlayer[],
      blacklistScoredList: ScoredPlayer[],
    ): number;

    /**
     * Calculates potential score as a percentage of benchmark
     */
    calculatePotentialScore(rawScore: number, benchmark: number): number;
  }

  const ScoringSystem: ScoringSystemModule;
  export default ScoringSystem;
}
