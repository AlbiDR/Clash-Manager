<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { useBenchmarking } from "@core/services/useBenchmarking";
import { computed } from "vue";
const props = defineProps<{
  label: string;
  value: string | number;
  loading?: boolean;
  benchmarkType?: "lb" | "hh";
  benchmarkMetric?: string;
  benchmarkRawValue?: number;
}>();

const { getSafeBenchmark } = useBenchmarking();

const benchmarkTooltipContent = computed(() => {
  if (props.loading || !props.benchmarkType || !props.benchmarkMetric) {
    return null;
  }
  return getSafeBenchmark(
    props.benchmarkType,
    props.benchmarkMetric,
    props.benchmarkRawValue,
  );
});
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
  gap: 2px;
  padding: 6px 4px;
  border-radius: 10px;
  background: var(--sys-color-surface-container-highest);
  border: 1px solid var(--sys-surface-glass-border);
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    background-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.stat-item:hover {
  transform: translateY(-2px) scale(1.02);
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 2;
}

.label {
  font-size: 9px;
  text-transform: uppercase;
  font-weight: 850;
  color: var(--sys-color-secondary);
  letter-spacing: 0.06em;
  opacity: 1;
  text-align: center;
  line-height: 1.1;
  min-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  word-break: break-word;
}

.value {
  font-size: 14px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  line-height: 1;
}

@media (max-width: 360px) {
  .stat-item {
    padding: 4px 2px;
  }
  .value {
    font-size: 13px;
  }
  .label {
    font-size: 8px;
  }
}
</style>
