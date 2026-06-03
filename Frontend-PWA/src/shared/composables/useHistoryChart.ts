// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  WAR_CONSTANTS,
  VOYAGE_CONSTANTS,
  calculatePrediction,
  parseHistoryString
} from "@core/utils/predictionMath";

/**
 * USE HISTORY CHART (Layer 2 - Shared Composables)
 * ----------------------------------------------------------------------------
 * Rationale: Centralizes the stateful logic for processing historical trends
 * and generating performance projections for War and Voyage visualizations.
 * ----------------------------------------------------------------------------
 */

export type HistoryChartType = "war" | "voyage";

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
    const valueSeries = processedData.map((h) => h.value);
    const nextValue = calculatePrediction(valueSeries, maxScale);

    // Arrange Oldest -> Newest for UI
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
