// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { generateLinearTrend, type Point } from "@core/utils/bezier";

/**
 * Represents a single processed bar item in the visualization chart.
 */
interface ChartBarItem {
  /** Unique element identifier for list rendering keys. */
  id: string;
  /** The raw numeric value of this bar (e.g. fame points or crowns). */
  value: number;
  /** The geometrically scaled height string, parsed as a percentage (e.g., "75%"). */
  height: string;
  /** True when the bar represents a predicted/projected future score. */
  isProjection: boolean;
  /** Tooltip label content containing human-readable week and formatted score details. */
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
 * - `chartData`: Computed object containing:
 *   - `bars`: Processed bar objects with scaled heights and tooltips.
 *   - `path`: SVG 'd' attribute for the linear trend line.
 *   - `projPoint`: X,Y coordinates for the projected data point dot.
 *   - `isPositive`: Boolean indicating if the trend gradient is positive.
 *   - `isEmpty`: Boolean indicating if the chart has no data to display.
 */
export function useBaseHistoryChart(options: UseBaseHistoryChartOptions) {
  const chartData = computed(() => {
    const historySeriesSnapshot = toValue(options.data);
    const projection = toValue(options.projection);
    const loading = toValue(options.loading);
    const maxScale = toValue(options.maxScale);

    // [THREAT:] DIVISION BY ZERO / NAN: If the dataset is empty or maxScale is zero,
    // geometric scaling will produce NaN, crashing the SVG renderer.
    // [DECISION LOG] EMPTY STATE GUARD: Returns a deterministic empty state to
    // prevent downstream rendering pathogens and satisfy UX stability mandates.
    if (loading || historySeriesSnapshot.length === 0 || maxScale === 0) {
      return {
        bars: [] as ChartBarItem[],
        path: null as string | null,
        projPoint: null as Point | null,
        isPositive: false,
        isEmpty: true,
      };
    }

    const processedChartBars: ChartBarItem[] = [];

    // 1. Process Actuals
    historySeriesSnapshot.forEach((historyEntrySnapshot) => {
      processedChartBars.push({
        id: historyEntrySnapshot.id,
        value: historyEntrySnapshot.value,
        height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (historyEntrySnapshot.value / maxScale) * 100))}%`,
        isProjection: false,
        tooltip: historyEntrySnapshot.tooltipLabel,
      });
    });

    // 2. Process Projection (if any)
    if (projection) {
      processedChartBars.push({
        id: "proj-next-value",
        value: projection.value,
        height: `${Math.max(CHART_MIN_HEIGHT, Math.min(100, (projection.value / maxScale) * 100))}%`,
        isProjection: true,
        tooltip: projection.tooltipLabel,
      });
    }

    // 3. Geometry
    const totalChartSlots = processedChartBars.length;
    // Map bars to X,Y coordinates (0-100 scale for SVG viewBox)
    const trendCurvePoints: Point[] = processedChartBars.map((chartBar, barIndex) => ({
      x: ((barIndex + 0.5) / totalChartSlots) * 100,
      y: (1 - Math.min(1, chartBar.value / maxScale)) * 100, // Invert Y for SVG
    }));

    // [DECISION LOG] LINEAR TREND (BEST FIT):
    // Uses a Least Squares regression to generate the trend path.
    // This provides a stable visual indicator of performance trajectory
    // without the erratic noise of raw spline interpolation.
    const linearTrendPath = generateLinearTrend(trendCurvePoints);

    // Identify key points for dots (These stay on the bars, not the line)
    const projectedTrendPoint = projection ? trendCurvePoints[trendCurvePoints.length - 1] : null;

    return {
      bars: processedChartBars,
      path: linearTrendPath.path,
      projPoint: projectedTrendPoint,
      isPositive: linearTrendPath.isPositive,
      isEmpty: false,
    };
  });

  return {
    chartData,
  };
}
