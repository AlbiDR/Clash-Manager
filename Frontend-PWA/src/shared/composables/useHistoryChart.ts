// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  WAR_CONSTANTS,
  VOYAGE_CONSTANTS,
  calculatePrediction,
  parseHistoryString
} from "@core/utils/predictionMath";

export type HistoryChartType = "war" | "voyage";

/**
 * COMPOSABLE: useHistoryChart
 *
 * @remarks
 * Centralizes the stateful logic for processing historical trends and generating
 * performance projections for War and Voyage visualizations. It abstracts the
 * complexity of parsing raw history strings and calculating weighted averages.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared Composable (@shared)
 * - **Role:** Data transformation and prediction orchestrator for history charts.
 * - **Satisfaction:** ADR Section III: Validation Boundaries (data parsing).
 *
 * @param history - Raw history string (e.g. "3600 2024-W12|2400 2024-W11") or reactive getter.
 * @param type - Determines constants (War vs Voyage) used for scaling and colors.
 * @param loading - Reactive state indicating if data is still being fetched.
 *
 * @returns
 * - `mappedData`: Computed object containing processed chart data, projection, and max scale.
 */
export function useHistoryChart(
  history: MaybeRefOrGetter<string | undefined>,
  type: HistoryChartType,
  loading: MaybeRefOrGetter<boolean> = false
) {
  const mappedData = computed(() => {
    const historyValue = toValue(history);
    const isLoading = toValue(loading);

    // [DECISION LOG] Early exit on loading to prevent unnecessary calculations on empty/stale state
    if (isLoading) return { data: [], projection: null, maxScale: 0 };

    const allHistory = parseHistoryString(historyValue);
    const limit = type === "war" ? 52 : 15;
    const maxScale = type === "war" ? WAR_CONSTANTS.MAX_FAME : VOYAGE_CONSTANTS.MAX_CROWNS;
    const unit = type === "war" ? "Fame" : "Crowns";
    const projColor = type === "war" ? "#fbbf24" : "#22d3ee";
    const idPrefix = type === "war" ? "h" : "vh";

    const processedData = allHistory.slice(0, limit);

    if (processedData.length === 0) {
      return { data: [], projection: null, maxScale };
    }

    // Predict
    // [DECISION LOG] TREND PREDICTION: Extracts raw values into a series for the
    // weighted decay calculator. Isolation here ensures UI formatting doesn't
    // leak into mathematical projections.
    const valueSeries = processedData.map((h) => h.value);
    const nextValue = calculatePrediction(valueSeries, maxScale);

    // Arrange Oldest -> Newest for UI
    // [DECISION LOG] CHRONOLOGICAL REVERSAL: History strings are stored with the
    // most recent entry first (index 0). SVG-based charts require left-to-right
    // (oldest-to-newest) ordering for correct trend visualization.
    const chronologicalData = [...processedData].reverse();
    const data = chronologicalData.map((h, i) => {
      // [DECISION LOG] Use readableWeek from parser which already handles date vs week formatting
      return {
        id: `${idPrefix}-${h.weekId}-${i}`,
        value: h.value,
        tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${h.readableWeek}</span><br>${h.value.toLocaleString()} ${unit}`
      };
    });

    const projection = {
      value: nextValue,
      tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:${projColor}">Projected</span><br>${Math.round(nextValue).toLocaleString()} ${unit}`
    };

    return { data, projection, maxScale };
  });

  return {
    mappedData
  };
}
