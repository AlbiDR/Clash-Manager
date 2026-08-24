// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import BaseBadge from "./BaseBadge.vue";
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";

/**
 * [UI] TENURE BADGE
 * Standardized component for displaying player clan tenure (days in clan),
 * with an optional benchmarking tooltip against the clan average.
 */
const props = defineProps<{
  /** Total days in clan */
  days: number | undefined;
  /** Context for benchmarking ('lb' for Leaderboard, 'hh' for Headhunter) */
  context?: "lb" | "hh";
}>();

const { benchmarkTooltipContent } = useBenchmarkedStat(
  () => props.context,
  "tenure",
  () => props.days
);
</script>

<template>
  <BaseBadge
    v-tooltip="benchmarkTooltipContent"
    class="tenure"
  >
    {{ props.days ?? 0 }}d
  </BaseBadge>
</template>

<style scoped>
/* TenureBadge inherits standard .badge styles from @core/theme/components.ts */
</style>
