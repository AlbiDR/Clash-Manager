<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { VOYAGE_CONSTANTS, calculatePrediction, parseHistoryString } from "@core/utils/predictionMath";
import { computed } from "vue";
import BaseHistoryChart from "./BaseHistoryChart.vue";

const props = defineProps<{
  history?: string;
  loading?: boolean;
}>();

const mappedData = computed(() => {
  if (props.loading) return { data: [], projection: null };

  const allHistory = parseHistoryString(props.history);
  const processedData = allHistory.slice(0, 15); // Limit to last 15 voyages

  if (processedData.length === 0) {
    return { data: [], projection: null };
  }

  // Predict
  const crownSeries = processedData.map((h) => h.value);
  const nextCrowns = calculatePrediction(crownSeries, VOYAGE_CONSTANTS.MAX_CROWNS);

  // Arrange Oldest -> Newest for UI
  const chronologicalData = [...processedData].reverse();
  const data = chronologicalData.map((h, i) => {
    let displayDate = h.weekId;
    if (displayDate.length >= 10) {
      displayDate = displayDate.substring(5).replace('-', '/');
    }

    return {
      id: `vh-${h.weekId}-${i}`,
      value: h.value,
      tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${displayDate}</span><br>${h.value.toLocaleString()} Crowns`
    };
  });

  const projection = {
    value: nextCrowns,
    tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:#22d3ee">Projected</span><br>${Math.round(nextCrowns).toLocaleString()} Crowns`
  };

  return { data, projection };
});
</script>

<template>
  <BaseHistoryChart
    theme="voyage"
    :data="mappedData.data"
    :projection="mappedData.projection"
    :loading="loading"
    :maxScale="VOYAGE_CONSTANTS.MAX_CROWNS"
    :winThreshold="100"
  />
</template>
