<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { useHistoryChart } from "../composables/useHistoryChart";
import BaseHistoryChart from "./BaseHistoryChart.vue";

const props = defineProps<{
  history?: string;
  loading?: boolean;
}>();

const { mappedData } = useHistoryChart(() => props.history, "war", () => props.loading);
</script>

<template>
  <BaseHistoryChart
    theme="war"
    :history-series="mappedData.data"
    :projection="mappedData.projection"
    :loading="loading"
    :maxScale="mappedData.maxScale"
  />
</template>
