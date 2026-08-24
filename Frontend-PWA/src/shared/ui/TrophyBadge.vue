// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import { formatNumber } from "../../core";
import Icon from "./Icon.vue";
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";

/**
 * [UI] TROPHY BADGE
 * Standardized component for displaying player trophies with benchmarking tooltips.
 */
const props = defineProps<{
  /** Current trophy count */
  value: number | undefined;
  /** Context for benchmarking ('lb' for Leaderboard, 'hh' for Headhunter) */
  context: "lb" | "hh";
}>();

const { benchmarkTooltipContent } = useBenchmarkedStat(
  () => props.context,
  "trophies",
  () => props.value
);
</script>

<template>
  <div
    v-tooltip="benchmarkTooltipContent"
    class="trophy-meta hit-target"
  >
    <Icon
      name="trophy"
      size="12"
    />
    <span class="trophy-val">{{ formatNumber(props.value) }}</span>
  </div>
</template>
