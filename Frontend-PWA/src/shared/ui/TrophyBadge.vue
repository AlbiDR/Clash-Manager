// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import Icon from "./Icon.vue";
import { useBenchmarking } from "@core/services/useBenchmarking";
import { computed } from "vue";

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

const { getSafeBenchmark } = useBenchmarking();

const benchmarkTooltipContent = computed(() => {
  return getSafeBenchmark(props.context, "trophies", props.value);
});
</script>

<template>
  <div
    class="trophy-meta hit-target"
    v-tooltip="benchmarkTooltipContent"
  >
    <Icon name="trophy" size="12" />
    <span class="trophy-val">{{ (props.value || 0).toLocaleString() }}</span>
  </div>
</template>

<style scoped>
.trophy-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sys-color-on-surface-variant);
  font-size: 11px;
  font-weight: 700;
}

.trophy-val {
  font-family: var(--sys-font-family-mono);
}
</style>
