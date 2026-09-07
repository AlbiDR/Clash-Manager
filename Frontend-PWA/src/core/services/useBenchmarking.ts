// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useAppSettings } from "./useAppSettings";
import { useClashDataStore } from "./useClashDataStore";

import { unref } from "vue";
import type { LeaderboardMember, Recruit } from "../types";
import { parseTimeAgoValue } from "../utils/time";

/**
 * Result object for a benchmarking comparison.
 *
 * @remarks
 * Satisfies ADR Section I: Core Services & Section IV: Performance & Analytics.
 * Provides normalized statistical metrics comparing individual member performance against clan baselines.
 */
export interface BenchmarkData {
  /** Human-readable name of the metric (e.g., 'Trophy Rank'). */
  label: string;
  /** Evaluated performance tier relative to the clan average. */
  tier: "ELITE" | "TOP TIER" | "GROWING" | "UNDER";
  /** The actual numeric value being compared. */
  value: number;
  /** The calculated mean value for this metric across the dataset. */
  avg: number;
  /** The lowest value recorded for this metric in the dataset. */
  min: number;
  /** The highest value recorded for this metric in the dataset. */
  max: number;
  /** Absolute percentage difference from the average. */
  percent: number;
  /** Indicates if the value is equal to or better than the average. */
  isBetter: boolean;
  /** Optional display format for values in the benchmark panel. */
  format?: "number" | "percent" | "durationMinutes";
}

type StatsMap = Record<string, { avg: number; max: number; min: number }>;
type MetricMetadata = {
  label: string | ((ctx: "lb" | "hh") => string);
  lowerIsBetter?: boolean;
  format?: BenchmarkData["format"];
};

/**
 * [PERF] LB METRIC EXTRACTORS
 *
 * @remarks
 * Satisfies ADR Section IV: Performance.
 * Hoisted to module level to eliminate per-render allocation churn in list view components.
 */
const LB_EXTRACTORS: Record<string, (m: LeaderboardMember) => number> = {
  trophies: (m) => m.t || 0,
  warRate: (m) => parseFloat(m.d?.rate || "0"),
  donations: (m) => m.d?.avg || 0,
  score: (m) => m.performanceScore || 0,
  rawScore: (m) => m.performanceRawScore || 0,
  tenure: (m) => m.d?.days || 0,
  momentum: (m) => m.dt || 0,
  winRate: (m) => m.d?.winRate || 0,
  avgFame: (m) => m.d?.wfame || 0,
  lastSeen: (m) => parseTimeAgoValue(m.d?.seen),
};

/**
 * [PERF] HH METRIC EXTRACTORS
 *
 * @remarks
 * Satisfies ADR Section IV: Performance.
 * Hoisted to module level to eliminate per-render allocation churn in recruit list components.
 */
const HH_EXTRACTORS: Record<string, (m: Recruit) => number> = {
  trophies: (m) => m.t || 0,
  donations: (m) => m.d?.don || 0,
  warWins: (m) => m.d?.war || 0,
  cardsWon: (m) => m.d?.cards || 0,
  winRate: (m) => m.d?.winRate || 0,
  score: (m) => m.potentialScore || 0,
  rawScore: (m) => m.potentialRawScore || 0,
  lastScan: (m) => m.lastScan ? Math.max(0, Math.floor((Date.now() - m.lastScan) / 60000)) : 99999999,
};

/**
 * [PERF] BENCHMARK LABELS
 *
 * @remarks
 * Satisfies ADR Section IV: Performance.
 * Hoisted to module level to prevent string allocation churn across render cycles.
 */
const BENCHMARK_METRICS: Record<string, MetricMetadata> = {
  trophies: { label: "Trophy Rank" },
  warRate: { label: "War Reliability" },
  donations: { label: (ctx) => (ctx === "lb" ? "Daily Average" : "Lifetime Donos") },
  warWins: { label: "Legacy War Wins" },
  cardsWon: { label: "Cards Won" },
  winRate: { label: "Win Rate", format: "percent" },
  score: { label: (ctx) => (ctx === "lb" ? "Performance" : "Potential") },
  rawScore: { label: (ctx) => (ctx === "lb" ? "Raw Performance" : "Raw Potential") },
  tenure: { label: "Clan Loyalty" },
  momentum: { label: "Growth Pace" },
  avgFame: { label: "Average Fame" },
  lastSeen: { label: "Last Seen", lowerIsBetter: true, format: "durationMinutes" },
  lastScan: { label: "Last Scan", lowerIsBetter: true, format: "durationMinutes" },
};

/**
 * [PERF] SINGLE-PASS STATS CALCULATOR
 *
 * @remarks
 * Satisfies ADR Section IV: Performance.
 * Reduces loop complexity from O(N*M) passes to O(N) by aggregating all metrics in one traversal.
 * Critical for maintaining 60FPS UI response when evaluating large roster datasets.
 *
 * @template T - The type of candidate item being analyzed.
 * @param candidatePool - Readonly array of items to analyze.
 * @param metricExtractors - Dictionary of functions to pull numeric values from items.
 * @returns A map of calculated statistics (avg, max, min) per metric, or null if candidate pool is empty.
 */
const calculateStats = <T>(
  candidatePool: readonly T[],
  metricExtractors: Record<string, (item: T) => number>,
): StatsMap | null => {
  // [GUARD] GUARD: Early return on empty datasets to prevent division by zero or NaN statistics propagation.
  if (!candidatePool.length) return null;

  const keys = Object.keys(metricExtractors);
  const statAccumulators: Record<
    string,
    { sum: number; max: number; min: number }
  > = {};

  // Initialize accumulators
  for (let i = 0; i < keys.length; i++) {
    statAccumulators[keys[i]] = { sum: 0, max: -Infinity, min: Infinity };
  }

  // [PERF] Single-pass aggregation across all metrics per item
  for (let i = 0; i < candidatePool.length; i++) {
    const candidateItem = candidatePool[i];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const observedMetricValue = metricExtractors[key](candidateItem);
      const metricAccumulator = statAccumulators[key];

      metricAccumulator.sum += observedMetricValue;
      if (observedMetricValue > metricAccumulator.max) metricAccumulator.max = observedMetricValue;
      if (observedMetricValue < metricAccumulator.min) metricAccumulator.min = observedMetricValue;
    }
  }

  const stats: StatsMap = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const metricAccumulator = statAccumulators[key];
    stats[key] = {
      avg: metricAccumulator.sum / candidatePool.length,
      max: metricAccumulator.max === -Infinity ? 0 : metricAccumulator.max,
      min: metricAccumulator.min === Infinity ? 0 : metricAccumulator.min,
    };
  }

  return stats;
};

/**
 * CORE: getBenchmark
 *
 * @remarks
 * Satisfies ADR Section I: Core Services.
 * Computes comparative data for a specific metric by looking up pre-calculated statistics in singleton state.
 *
 * **Tier Resolution:**
 * - **ELITE**: Value is >= 90% of maximum recorded value (or <= 1.1x min for inverted metrics).
 * - **TOP TIER**: Value is above clan average.
 * - **GROWING**: Value is between 50% and 100% of clan average.
 * - **UNDER**: Value is below 50% of clan average (or > 2x average for inverted metrics).
 *
 * @param context - The dataset context ('lb' for Leaderboard, 'hh' for Headhunter).
 * @param metric - The key of the metric to compare.
 * @param value - The individual player's numeric value for the metric.
 * @returns A BenchmarkData object or null if statistics are unavailable.
 */
// [PERF] WeakMap memoization cache keyed by the reactive rawData payload object reference.
// [DECISION LOG] Prevents O(N) recalculation across multiple component render cycles (e.g. MemberCard lists)
// while ensuring automatic garbage collection and preventing state leaks across store resets or unit test boundaries.
const statsCache = new WeakMap<
  object,
  { lb: StatsMap | null; hh: StatsMap | null }
>();

/**
 * COMPOSABLE: useBenchmarking (Layer 1 - @core)
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 1 Core Service (@core/services).
 * - **Role:** Statistical engine for comparing player performance against clan averages.
 * - **Satisfaction:** Satisfies ADR Section I: Core Services & Section IV: Performance.
 *
 * Optimized via WeakMap memoization to share calculated metrics across all component instances
 * without duplicating reactive listeners, statistical passes, or store hook lookups.
 *
 * [ARCHITECTURE] ADR LAYER: @core
 * - Permitted Imports: Layer 1 services, Pinia stores, and Vue core.
 * - Forbidden Imports: Any component or service from Layer 2 (Shared) or Layer 3 (Features).
 *
 * @returns Object contract containing `getBenchmark` and `getSafeBenchmark` comparison helper functions.
 */
export function useBenchmarking() {
  const clashDataStore = useClashDataStore();
  const appSettings = useAppSettings();

  /**
   * CORE: getBenchmark
   *
   * @remarks
   * Satisfies ADR Section I: Core Services.
   * Computes comparative data for a specific metric by looking up pre-calculated statistics in singleton state.
   *
   * @param context - The dataset context ('lb' for Leaderboard, 'hh' for Headhunter).
   * @param metric - The key of the metric to compare.
   * @param value - The individual player's numeric value for the metric.
   * @returns A BenchmarkData object or null if statistics are unavailable.
   */
  function getBenchmark(
    context: "lb" | "hh",
    metric: string,
    value: number,
  ): BenchmarkData | null {
    const rawData = unref(clashDataStore.data);
    if (!rawData || typeof rawData !== "object") return null;

    let cached = statsCache.get(rawData);
    if (!cached) {
      cached = {
        lb: calculateStats(rawData.lb || [], LB_EXTRACTORS),
        hh: calculateStats(rawData.hh || [], HH_EXTRACTORS),
      };
      statsCache.set(rawData, cached);
    }

    const stats = context === "lb" ? cached.lb : cached.hh;
    if (!stats) return null;

    const metricStats = stats[metric];
    if (!metricStats) return null;

    const metricMetadata = BENCHMARK_METRICS[metric];
    const scoreDelta = value - metricStats.avg;
    // [DECISION LOG] Safeguard against division by zero if metricStats.avg is 0.
    const deviationPercentage = Math.abs(Math.round((scoreDelta / (metricStats.avg || 1)) * 100));
    const isAboveAverage = metricMetadata?.lowerIsBetter ? scoreDelta <= 0 : scoreDelta >= 0;

    const labelRaw = metricMetadata?.label;
    const label =
      typeof labelRaw === "function" ? labelRaw(context) : labelRaw || metric;

    // [DECISION LOG] Performance tier mapping branches based on whether lower metric values represent better performance (e.g. lastSeen duration).
    const performanceTier = metricMetadata?.lowerIsBetter
      ? value <= metricStats.min * 1.1
        ? "ELITE"
        : isAboveAverage
          ? "TOP TIER"
          : value > metricStats.avg * 2
            ? "UNDER"
            : "GROWING"
      : value >= metricStats.max * 0.9
        ? "ELITE"
        : isAboveAverage
          ? "TOP TIER"
          : value < metricStats.avg * 0.5
            ? "UNDER"
            : "GROWING";

    return {
      label,
      tier: performanceTier as BenchmarkData["tier"],
      value,
      avg: metricStats.avg,
      min: metricStats.min,
      max: metricStats.max,
      percent: deviationPercentage,
      isBetter: isAboveAverage,
      format: metricMetadata?.format,
    };
  }

  /**
   * HELPER: getSafeBenchmark
   *
   * @remarks
   * Satisfies ADR Section I: Core Services.
   * Combines App Settings (ghostBenchmarking feature flag toggle) and value validation
   * to provide a safe evaluation boundary for UI templates and tooltips.
   *
   * @param context - The dataset context ('lb' for Leaderboard, 'hh' for Headhunter).
   * @param metric - The key of the metric to compare.
   * @param value - The value to compare (handles undefined values gracefully).
   * @returns A BenchmarkData object or null if ghost benchmarking is disabled or value is missing.
   */
  function getSafeBenchmark(
    context: "lb" | "hh",
    metric: string,
    value: number | undefined,
  ): BenchmarkData | null {
    // [GUARD] GUARD: Check ghostBenchmarking setting toggle and value existence before running statistical lookup.
    if (!appSettings.modules?.ghostBenchmarking || value === undefined) return null;
    return getBenchmark(context, metric, value);
  }

  return { getBenchmark, getSafeBenchmark };
}
