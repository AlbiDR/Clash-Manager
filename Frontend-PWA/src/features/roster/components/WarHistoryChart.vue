<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { WAR_CONSTANTS, calculatePrediction, parseHistoryString } from "@core/utils/predictionMath";
import { computed } from "vue";
import { BaseHistoryChart } from "@shared";

const props = defineProps<{
  history?: string;
  loading?: boolean;
}>();

const mappedData = computed(() => {
  if (props.loading) return { data: [], projection: null };

  const allHistory = parseHistoryString(props.history);
  const processedData = allHistory.slice(0, 52); // Limit to last year

  if (processedData.length === 0) {
    return { data: [], projection: null };
  }

  // Predict
  const fameSeries = processedData.map((h) => h.value);
  const nextFame = calculatePrediction(fameSeries, WAR_CONSTANTS.MAX_FAME);

  // Arrange Oldest -> Newest for UI
  const chronologicalData = [...processedData].reverse();
  const data = chronologicalData.map((h, i) => ({
    id: `h-${h.readableWeek}-${i}`,
    value: h.value,
    tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase">${h.readableWeek}</span><br>${h.value.toLocaleString()} Fame`
  }));

  const projection = {
    value: nextFame,
    tooltipLabel: `<span style="font-size:10px;opacity:0.8;text-transform:uppercase;color:#fbbf24">Projected</span><br>${Math.round(nextFame).toLocaleString()} Fame`
  };

  return { data, projection };
});
</script>

<template>
  <BaseHistoryChart
    theme="war"
    :data="mappedData.data"
    :projection="mappedData.projection"
    :loading="loading"
    :maxScale="WAR_CONSTANTS.MAX_FAME"
  />
</template>
