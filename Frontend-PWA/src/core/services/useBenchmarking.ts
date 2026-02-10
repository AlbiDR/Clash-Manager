/**
 * 📊 USE BENCHMARKING
 * Statistical engine for comparing player performance against clan averages.
 *
 * Optimized to perform single-pass calculations for all metrics to ensure
 * maximum performance on large datasets.
 */
import { computed } from "vue";
import { useClashData } from "@core";
import { useAppSettings } from "@core";

export interface BenchmarkData {
  label: string;
  tier: "ELITE" | "TOP TIER" | "GROWING" | "UNDER";
  value: number;
  avg: number;
  min: number;
  max: number;
  percent: number;
  isBetter: boolean;
}

type StatsMap = Record<string, { avg: number; max: number; min: number }>;

export function useBenchmarking() {
  const { data } = useClashData();
  const { modules } = useAppSettings();

  /**
   * ⚡ SINGLE-PASS STATS CALCULATOR
   * Reduces loop complexity from O(N*M) passes to O(N) by aggregating all
   * metrics in one traversal.
   */
  const calculateStats = <T>(
    items: T[],
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

  const lbStats = computed(() => {
    const lb = data.value?.lb || [];
    return calculateStats(lb as any[], {
      trophies: (m) => m.t || 0,
      warRate: (m) => parseFloat(m.d?.rate || "0"),
      donations: (m) => m.d?.avg || 0,
      score: (m) => m.performanceScore || 0,
      tenure: (m) => m.d?.days || 0,
      momentum: (m) => m.dt || 0,
    });
  });

  const hhStats = computed(() => {
    const hh = data.value?.hh || [];
    return calculateStats(hh as any[], {
      trophies: (m) => m.t || 0,
      donations: (m) => m.d?.don || 0,
      warWins: (m) => m.d?.war || 0,
      cardsWon: (m) => m.d?.cards || 0,
      score: (m) => m.potentialScore || 0,
    });
  });

  /**
   * CORE: getBenchmark
   * Computes comparative data for a specific metric.
   */
  function getBenchmark(
    context: "lb" | "hh",
    metric: string,
    value: number,
  ): BenchmarkData | null {
    const stats = context === "lb" ? lbStats.value : hhStats.value;
    if (!stats) return null;

    const m = stats[metric];
    if (!m) return null;

    const diff = value - m.avg;
    const percent = Math.abs(Math.round((diff / (m.avg || 1)) * 100));
    const isBetter = diff >= 0;

    const labels: Record<string, string> = {
      trophies: "Trophy Rank",
      warRate: "War Reliability",
      donations: context === "lb" ? "Daily Average" : "Lifetime Donos",
      warWins: "Legacy War Wins",
      cardsWon: "Cards Won",
      score: context === "lb" ? "Performance" : "Potential",
      tenure: "Clan Loyalty",
      momentum: "Growth Pace",
    };

    const tier =
      value >= m.max * 0.9
        ? "ELITE"
        : isBetter
          ? "TOP TIER"
          : value < m.avg * 0.5
            ? "UNDER"
            : "GROWING";

    return {
      label: labels[metric] || metric,
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
   * Combines App Settings (ghostBenchmarking toggle) and value validation
   * to provide a clean, one-liner for template tooltips.
   */
  function getSafeBenchmark(
    context: "lb" | "hh",
    metric: string,
    value: number | undefined,
  ): BenchmarkData | null {
    if (!modules.ghostBenchmarking || value === undefined) return null;
    return getBenchmark(context, metric, value);
  }

  return { getBenchmark, getSafeBenchmark };
}
