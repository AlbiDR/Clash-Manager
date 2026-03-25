// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import { useBenchmarking } from "@core/services/useBenchmarking";
import { computed } from "vue";

/**
 * [UI] TENURE BADGE
 * Standardized component for displaying player tenure (days in clan)
 * with benchmarking tooltips.
 */
const props = defineProps<{
  /** Days spent in the clan */
  days: number | undefined;
}>();

const { getSafeBenchmark } = useBenchmarking();

const tooltipVal = computed(() => {
  return getSafeBenchmark("lb", "tenure", props.days);
});
</script>

<template>
  <div
    class="badge tenure hit-target"
    v-tooltip="tooltipVal"
  >
    {{ props.days || 0 }}d
  </div>
</template>

<style scoped>
.badge.tenure {
  background: rgba(var(--sys-color-on-surface-rgb), 0.05);
  color: var(--sys-color-on-surface-variant);
  border: 1px solid rgba(var(--sys-color-on-surface-rgb), 0.1);
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
}
</style>
