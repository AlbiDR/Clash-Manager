// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useBenchmarking } from "@core/services/useBenchmarking";

/**
 * COMPOSABLE: useBenchmarkedStat
 *
 * @remarks
 * Encapsulates the reactive logic for generating benchmarking tooltips.
 * It integrates with the core Benchmarking engine and ensures tooltips
 * are correctly suppressed during loading states or if parameters are missing.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Tooltip content generator for benchmarked statistics.
 * - **Satisfaction:** CleanStack Refinement (Logic De-duplication).
 *
 * @param context - The benchmarking dataset context ('lb' or 'hh').
 * @param metric - The metric key to compare (e.g., 'score', 'trophies', 'momentum').
 * @param value - The raw numeric value to benchmark.
 * @param loading - Reactive state indicating if the component or data is loading.
 *
 * @returns
 * - `benchmarkTooltipContent`: Computed tooltip data or null if benchmarking is unavailable.
 */
export function useBenchmarkedStat(
  context: MaybeRefOrGetter<"lb" | "hh" | undefined>,
  metric: MaybeRefOrGetter<string | undefined>,
  value: MaybeRefOrGetter<number | undefined>,
  loading: MaybeRefOrGetter<boolean> = false
) {
  const { getSafeBenchmark } = useBenchmarking();

  const benchmarkTooltipContent = computed(() => {
    const ctx = toValue(context);
    const m = toValue(metric);
    const statValue = toValue(value);
    const isLoading = toValue(loading);

    // [DECISION LOG] Safeguard: Prevent benchmarking during loading or if
    // required context/metric is missing to avoid reactive churn on invalid state.
    if (isLoading || !ctx || !m) {
      return null;
    }

    return getSafeBenchmark(ctx, m, statValue);
  });

  return {
    benchmarkTooltipContent
  };
}
