// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { formatNumber } from "@core/utils/math";

export type HistoryChartType = "war" | "voyage";

const WAR_CONSTANTS = { MAX_FAME: 3600 };
const VOYAGE_CONSTANTS = { MAX_CROWNS: 250 };

/**
 * Represents a single parsed historical record.
 */
interface HistoryEntry {
  /** The numeric performance score (e.g. fame points or crowns). */
  value: number;
  /** The unique identifier representing the week (e.g. "2024-W12" or YYYY-MM-DD). */
  weekId: string;
  /** Human-readable string representing the week for UI labels. */
  readableWeek: string;
}

/**
 * Parses a raw, delimited history string into a series of structured HistoryEntry objects.
 *
 * @remarks
 * Supports multiple formats including pipe/comma separated values, date patterns (YYYY-MM-DD),
 * and standard week formats (e.g. 2024-W12).
 *
 * @param historyStr - The raw history string from database storage.
 * @returns Array of parsed and structured history entry objects.
 */
function parseHistoryString(historyStr: string | undefined): HistoryEntry[] {
  if (!historyStr || historyStr === "-") return [];
  const weekRegex = /(\d+)[W-](?:W)?(\d+)/;
  return historyStr
    .split(/[|,]/)
    .map((rawEntryToken) => rawEntryToken.trim())
    .filter(Boolean)
    .map((historyEntryToken) => {
      const [valueToken, weekStr] = historyEntryToken.split(" ");
      const parsedHistoryValue = parseInt(valueToken || "0", 10) || 0;
      const weekStringToken = weekStr || "";
      const weekFormatMatch = weekStringToken.match(weekRegex);
      let formattedReadableWeek = weekStringToken || "?";
      if (/^\d{4}-\d{2}-\d{2}$/.test(weekStringToken)) {
        formattedReadableWeek = weekStringToken.substring(5).replace('-', '/');
      } else if (weekFormatMatch) {
        formattedReadableWeek = `Week ${parseInt(weekFormatMatch[2], 10)}`;
      }
      return { value: parsedHistoryValue, weekId: weekStringToken, readableWeek: formattedReadableWeek };
    });
}

/**
 * Calculates a weighted decay prediction score based on historical performance series.
 *
 * @remarks
 * [DECISION LOG] WEIGHTED DECAY:
 * Weights start at 1.0 for the most recent entry and decrement by 0.05 per week
 * down to a floor of 0.5. This ensures recent performance is more heavily weighted
 * and predictive while older historical data still contributes safely without dominating.
 *
 * @param historyScores - Sequence of historical score integers.
 * @param maxScore - Upper boundary limit for the calculated prediction (coerced bounds).
 * @returns Projected next performance score.
 */
function calculatePrediction(historyScores: number[], maxScore: number): number {
  const scoresLength = historyScores.length;
  if (scoresLength === 0) return 0;
  let totalWeightedScore = 0;
  let totalWeights = 0;
  for (let scoreIndex = 0; scoreIndex < scoresLength; scoreIndex++) {
    const decayWeightFactor = Math.max(0.5, 1.0 - (scoreIndex * 0.05));
    totalWeightedScore += historyScores[scoreIndex] * decayWeightFactor;
    totalWeights += decayWeightFactor;
  }
  const calculatedProjectionValue = totalWeights > 0 ? totalWeightedScore / totalWeights : 0;
  return Math.max(0, Math.min(maxScore, calculatedProjectionValue));
}

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
    const historyLimitThreshold = type === "war" ? 52 : 15;
    const maxChartValueScale = type === "war" ? WAR_CONSTANTS.MAX_FAME : VOYAGE_CONSTANTS.MAX_CROWNS;
    const chartUnitLabel = type === "war" ? "Fame" : "Crowns";
    const chartElementIdPrefix = type === "war" ? "h" : "vh";

    const processedData = allHistory.slice(0, historyLimitThreshold);

    if (processedData.length === 0) {
      return { data: [], projection: null, maxScale: maxChartValueScale };
    }

    // [DECISION LOG] TREND PREDICTION: Extracts raw values into a series for the
    // weighted decay calculator. Isolation here ensures UI formatting doesn't
    // leak into mathematical projections.
    const valueSeries = processedData.map((historyItem) => historyItem.value);
    const projectedNextValue = calculatePrediction(valueSeries, maxChartValueScale);

    // [DECISION LOG] CHRONOLOGICAL REVERSAL: History strings are stored with the
    // most recent entry first (index 0). SVG-based charts require left-to-right
    // (oldest-to-newest) ordering for correct trend visualization.
    const chronologicalData = [...processedData].reverse();
    const historyChartSeries = chronologicalData.map((historyItem, chronologicalIndex) => {
      return {
        id: `${chartElementIdPrefix}-${historyItem.weekId}-${chronologicalIndex}`,
        value: historyItem.value,
        // [DECISION LOG] Plain text, not HTML: the tooltip renderer uses safe text
        // interpolation (no innerHTML/v-html), so this must stay markup-free.
        tooltipLabel: `${historyItem.readableWeek}\n${formatNumber(historyItem.value)} ${chartUnitLabel}`
      };
    });

    const projection = {
      value: projectedNextValue,
      tooltipLabel: `Projected\n${formatNumber(Math.round(projectedNextValue))} ${chartUnitLabel}`
    };

    return { data: historyChartSeries, projection, maxScale: maxChartValueScale };
  });

  return {
    mappedData
  };
}
