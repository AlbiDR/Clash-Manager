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
}

type StatsMap = Record<string, { avg: number; max: number; min: number }>;

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
  tenure: (m) => m.d?.days || 0,
  momentum: (m) => m.dt || 0,
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
  score: (m) => m.potentialScore || 0,
};

/**
 * [PERF] BENCHMARK LABELS
 * Rationale: Hoisted to module level to prevent allocation churn.
 */
const BENCHMARK_LABELS: Record<
  string,
  string | ((ctx: "lb" | "hh") => string)
> = {
  trophies: "Trophy Rank",
  warRate: "War Reliability",
  donations: (ctx) => (ctx === "lb" ? "Daily Average" : "Lifetime Donos"),
  warWins: "Legacy War Wins",
  cardsWon: "Cards Won",
  score: (ctx) => (ctx === "lb" ? "Performance" : "Potential"),
  tenure: "Clan Loyalty",
  momentum: "Growth Pace",
};

/**
 * [PERF] SINGLE-PASS STATS CALCULATOR
 *
 * @remarks
 * Reduces loop complexity from O(N*M) passes to O(N) by aggregating all
 * metrics in one traversal. This is critical for maintaining 60FPS when
 * processing large member lists.
 *
 * @param items - Readonly array of items to analyze.
 * @param extractors - Dictionary of functions to pull numeric values from items.
 * @returns A map of calculated statistics (avg, max, min) per metric.
 */
const calculateStats = <T>(
  items: readonly T[],
  extractors: Record<string, (item: T) => number>,
): StatsMap | null => {
  if (!items.length) return null;

  const keys = Object.keys(extractors);
  const accumulators: Record<
    string,
    { sum: number; max: number; min: number }
  > = {};

  // Initialize
  for (let i = 0; i < keys.length; i++) {
    accumulators[keys[i]] = { sum: 0, max: -Infinity, min: Infinity };
  }

  // Single Pass
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const val = extractors[key](item);
      const acc = accumulators[key];

      acc.sum += val;
      if (val > acc.max) acc.max = val;
      if (val < acc.min) acc.min = val;
    }
  }

  const stats: StatsMap = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const acc = accumulators[key];
    stats[key] = {
      avg: acc.sum / items.length,
      max: acc.max === -Infinity ? 0 : acc.max,
      min: acc.min === Infinity ? 0 : acc.min,
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

  const m = stats[metric];
  if (!m) return null;

  const diff = value - m.avg;
  const percent = Math.abs(Math.round((diff / (m.avg || 1)) * 100));
  const isBetter = diff >= 0;

  const labelRaw = BENCHMARK_LABELS[metric];
  const label =
    typeof labelRaw === "function" ? labelRaw(context) : labelRaw || metric;

  const tier =
    value >= m.max * 0.9
      ? "ELITE"
      : isBetter
        ? "TOP TIER"
        : value < m.avg * 0.5
          ? "UNDER"
          : "GROWING";

  return {
    label,
    tier: tier as BenchmarkData["tier"],
    value,
    avg: m.avg,
    min: m.min,
    max: m.max,
    percent,
    isBetter,
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
