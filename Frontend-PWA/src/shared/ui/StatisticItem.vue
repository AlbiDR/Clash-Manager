<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";

const props = defineProps<{
  label: string;
  value: string | number;
  loading?: boolean;
  benchmarkType?: "lb" | "hh";
  benchmarkMetric?: string;
  benchmarkRawValue?: number;
}>();

const { benchmarkTooltipContent } = useBenchmarkedStat(
  () => props.benchmarkType,
  () => props.benchmarkMetric,
  () => props.benchmarkRawValue,
  () => props.loading
);
</script>

<template>
  <div v-if="props.loading" class="stat-item skeleton-anim">
    <div class="label"><div class="sk-label-box"></div></div>
    <div class="value"><div class="sk-value-box"></div></div>
  </div>
  <div v-else class="stat-item hit-target" v-tooltip="benchmarkTooltipContent" :aria-label="benchmarkTooltipContent ? `${props.label}: ${props.value}. ${benchmarkTooltipContent}` : `${props.label}: ${props.value}`">
    <span class="label" :aria-hidden="'true'">{{ props.label }}</span>
    <span class="value" :aria-hidden="'true'">{{ props.value }}</span>
  </div>
</template>

<style scoped>
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sys-space-2);
  padding: var(--sys-space-6) var(--sys-space-4);
  border-radius: var(--sys-shape-corner-stat);
  background: var(--sys-color-surface-container-highest);
  border: 1px solid var(--sys-surface-glass-border);
  transition:
    transform var(--sys-motion-duration-200) var(--sys-motion-easing-spring-overshoot),
    background-color var(--sys-motion-duration-200) ease,
    box-shadow var(--sys-motion-duration-200) ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.stat-item:hover {
  transform: translateY(-2px) scale(1.02);
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 2;
}

.label {
  font-size: var(--sys-typescale-label-sm);
  text-transform: uppercase;
  font-weight: 850;
  color: var(--sys-color-secondary);
  letter-spacing: var(--sys-tracking-wider);
  opacity: 1;
  text-align: center;
  line-height: var(--sys-leading-tight);
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  word-break: break-word;
}

.value {
  font-size: var(--sys-typescale-body-md);
  font-weight: 900;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  line-height: var(--sys-leading-none);
}

@media (max-width: 360px) {
  .stat-item {
    padding: var(--sys-space-4) var(--sys-space-2);
  }
  .value {
    font-size: var(--sys-typescale-body-sm);
  }
  .label {
    font-size: var(--sys-typescale-label-xs);
  }
}
</style>
