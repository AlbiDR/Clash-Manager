// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { generateLinearTrend, type Point } from "@core/utils/bezier";

interface ChartBarItem {
  id: string;
  value: number;
  height: string;
  isProjection: boolean;
  tooltip: string;
}

export interface UseBaseHistoryChartOptions {
  /** Format: array of { id, value, tooltipLabel } (Oldest to Newest) */
  data: MaybeRefOrGetter<{ id: string; value: number; tooltipLabel: string }[]>;
  /** Optional projected next value */
  projection: MaybeRefOrGetter<{ value: number; tooltipLabel: string } | null>;
  /** Whether data is loading */
  loading?: MaybeRefOrGetter<boolean | undefined>;
  /** Max value for scaling heights */
  maxScale: MaybeRefOrGetter<number>;
}

const CHART_MIN_HEIGHT = 15; // Percent

/**
 * COMPOSABLE: useBaseHistoryChart
 *
 * @remarks
 * Extends the visualization logic for historical data charts. It handles
 * the geometric translation of raw values into SVG paths and bar heights,
 * including linear trend line generation.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Geometric data preparation for history visualizations.
 * - **Satisfaction:** SRP (extracted from BaseHistoryChart.vue).
 *
 * @param options - Reactive chart configuration (data, projection, loading, maxScale).
 *
 * @returns
 * - `chartData`: Computed object containing processed bars, SVG path, projection point, and state flags.
 */
export function useBaseHistoryChart(options: UseBaseHistoryChartOptions) {
  const chartData = computed(() => {
    const data = toValue(options.data);
    const projection = toValue(options.projection);
    const loading = toValue(options.loading);
    const maxScale = toValue(options.maxScale);

    if (loading || data.length === 0) {
      return {
        bars: [] as ChartBarItem[],
        path: null as string | null,
        projPoint: null as Point | null,
        isPositive: false,
        isEmpty: true,
      };
    }

    const bars: ChartBarItem[] = [];

    // 1. Process Actuals
    data.forEach((entry) => {
      bars.push({
        id: entry.id,
        value: entry.value,
        height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (entry.value / maxScale) * 100))}%`,
        isProjection: false,
        tooltip: entry.tooltipLabel,
      });
    });

    // 2. Process Projection (if any)
    if (projection) {
      bars.push({
        id: "proj-next-value",
        value: projection.value,
        height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (projection.value / maxScale) * 100))}%`,
        isProjection: true,
        tooltip: projection.tooltipLabel,
      });
    }

    // 3. Geometry
    const totalSlots = bars.length;
    // Map bars to X,Y coordinates (0-100 scale for SVG viewBox)
    const curvePoints: Point[] = bars.map((bar, barIndex) => ({
      x: ((barIndex + 0.5) / totalSlots) * 100,
      y: (1 - Math.min(1, bar.value / maxScale)) * 100, // Invert Y for SVG
    }));

    // Generate Linear Trend Line (Best Fit)
    const trend = generateLinearTrend(curvePoints);

    // Identify key points for dots (These stay on the bars, not the line)
    const projPoint = projection ? curvePoints[curvePoints.length - 1] : null;

    return {
      bars,
      path: trend.path,
      projPoint,
      isPositive: trend.isPositive,
      isEmpty: false,
    };
  });

  return {
    chartData,
  };
}
