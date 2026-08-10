// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * [LOGIC] USE BENCHMARKING
 * Statistical engine for comparing player performance against clan averages.
 *
 * Optimized to perform single-pass calculations for all metrics to ensure
 * maximum performance on large datasets.
 */
import { useAppSettings, type ModuleState } from "./useAppSettings";
import { useClashDataStore } from "./useClashDataStore";
import { storeToRefs } from "pinia";

import { computed, type ComputedRef } from "vue";
import type { LeaderboardMember, Recruit } from "../types";
import { parseTimeAgoValue } from "../utils/time";

/**
 * Result object for a benchmarking comparison.
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

// [PERF] PERFORMANCE: Singleton state for benchmarking engine.
// Moving state and logic to module level prevents O(N) re-creation of computed properties
// and extractors when useBenchmarking is called in large lists (e.g., MemberCard).
let lbStats: ComputedRef<StatsMap | null> | null = null;
let hhStats: ComputedRef<StatsMap | null> | null = null;
let sharedModules: ModuleState | null = null;

/**
 * [PERF] LB METRIC EXTRACTORS
 * Rationale: Hoisted to module level to prevent allocation churn.
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
 * Rationale: Hoisted to module level to prevent allocation churn.
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
 * Rationale: Hoisted to module level to prevent allocation churn.
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
 * Reduces loop complexity from O(N*M) passes to O(N) by aggregating all
 * metrics in one traversal. This is critical for maintaining 60FPS when
 * processing large member lists.
 *
 * @param candidatePool - Readonly array of items to analyze.
 * @param metricExtractors - Dictionary of functions to pull numeric values from items.
 * @returns A map of calculated statistics (avg, max, min) per metric.
 */
const calculateStats = <T>(
  candidatePool: readonly T[],
  metricExtractors: Record<string, (item: T) => number>,
): StatsMap | null => {
  if (!candidatePool.length) return null;

  const keys = Object.keys(metricExtractors);
  const statAccumulators: Record<
    string,
    { sum: number; max: number; min: number }
  > = {};

  // Initialize
  for (let i = 0; i < keys.length; i++) {
    statAccumulators[keys[i]] = { sum: 0, max: -Infinity, min: Infinity };
  }

  // Single Pass
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
 * Computes comparative data for a specific metric by looking up pre-calculated
 * statistics in the singleton state.
 *
 * **Tier Resolution:**
 * - **ELITE**: Value is >= 90% of the maximum recorded value.
 * - **TOP TIER**: Value is above the clan average.
 * - **GROWING**: Value is between 50% and 100% of the clan average.
 * - **UNDER**: Value is below 50% of the clan average.
 *
 * @param context - The dataset context ('lb' for Leaderboard, 'hh' for Headhunter).
 * @param metric - The key of the metric to compare.
 * @param value - The individual player's value for the metric.
 * @returns A BenchmarkData object or null if statistics are unavailable.
 */
function getBenchmark(
  context: "lb" | "hh",
  metric: string,
  value: number,
): BenchmarkData | null {
  const stats = context === "lb" ? lbStats?.value : hhStats?.value;
  if (!stats) return null;

  const metricStats = stats[metric];
  if (!metricStats) return null;

  const metricMetadata = BENCHMARK_METRICS[metric];
  const scoreDelta = value - metricStats.avg;
  const deviationPercentage = Math.abs(Math.round((scoreDelta / (metricStats.avg || 1)) * 100));
  const isAboveAverage = metricMetadata?.lowerIsBetter ? scoreDelta <= 0 : scoreDelta >= 0;

  const labelRaw = metricMetadata?.label;
  const label =
    typeof labelRaw === "function" ? labelRaw(context) : labelRaw || metric;

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
 * Combines App Settings (ghostBenchmarking toggle) and value validation
 * to provide a clean, one-liner for template tooltips.
 *
 * @param context - The dataset context ('lb' or 'hh').
 * @param metric - The key of the metric.
 * @param value - The value to compare (handles undefined).
 * @returns A BenchmarkData object or null if benchmarking is disabled or value is missing.
 */
function getSafeBenchmark(
  context: "lb" | "hh",
  metric: string,
  value: number | undefined,
): BenchmarkData | null {
  if (!sharedModules?.ghostBenchmarking || value === undefined) return null;
  return getBenchmark(context, metric, value);
}

/**
 * COMPOSABLE: useBenchmarking
 *
 * @remarks
 * Statistical engine for comparing player performance against clan averages.
 * Optimized via a module-level singleton pattern to share results across
 * all component instances.
 *
 * **Architecture:**
 * - **Structural Unitary Architecture:** Acts as a Layer 1 core service.
 * - **Clinical Isolation:** Logic is domain-agnostic, relying on extractors
 *   provided at the core level.
 *
 * @returns
 * - `getBenchmark`: Direct comparison function.
 * - `getSafeBenchmark`: Settings-guarded comparison function.
 */
export function useBenchmarking() {
  // [PERF] LAZY INIT: Only initialize the singleton when first requested.
  // This avoids evaluation issues during testing and ensures state is ready.
  if (!lbStats) {
    const clashDataStore = useClashDataStore();
    const { data } = storeToRefs(clashDataStore);
    const { modules } = useAppSettings();
    sharedModules = modules;

    lbStats = computed(() => {
      // Logic: Extract metrics for the Leaderboard (Internal Member) context
      const lb = data.value?.lb || [];
      return calculateStats(lb, LB_EXTRACTORS);
    });

    hhStats = computed(() => {
      // Logic: Extract metrics for the Headhunter (Prospective Recruit) context
      const hh = data.value?.hh || [];
      return calculateStats(hh, HH_EXTRACTORS);
    });
  }

  return { getBenchmark, getSafeBenchmark };
}
