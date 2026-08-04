<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { formatNumber } from "../../core";
import type { BenchmarkData } from "../../core";

/**
 * [UI] BENCHMARK CONTENT
 * ----------------------------------------------------------------------------
 * Rationale: Presentational content shared by the desktop popover and the
 * mobile bottom sheet. Renders a `BenchmarkData` comparison (label, tier,
 * min/avg/max range track, delta) or a plain informational string.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 */
const props = defineProps<{
  data: BenchmarkData | string;
}>();

const benchmark = computed(() =>
  typeof props.data === "string" ? null : props.data,
);

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const tierSlug = computed(() =>
  benchmark.value ? benchmark.value.tier.toLowerCase().replace(/\s+/g, "-") : "",
);

const range = computed(() =>
  benchmark.value ? benchmark.value.max - benchmark.value.min || 1 : 1,
);

const playerPosition = computed(() =>
  benchmark.value
    ? clampPercent(((benchmark.value.value - benchmark.value.min) / range.value) * 100)
    : 0,
);

const averagePosition = computed(() =>
  benchmark.value
    ? clampPercent(((benchmark.value.avg - benchmark.value.min) / range.value) * 100)
    : 0,
);

const sentiment = computed(() => (benchmark.value?.isBetter ? "better" : "worse"));

const delta = computed(() =>
  benchmark.value
    ? `${benchmark.value.isBetter ? "+" : "-"}${benchmark.value.percent}%`
    : "",
);
</script>

<template>
  <div v-if="!benchmark" class="bc-simple">{{ data }}</div>
  <div v-else class="bc-panel">
    <div class="bc-header">
      <span class="bc-label">{{ benchmark.label }}</span>
      <span class="bc-tier" :class="`tier-${tierSlug}`">{{ benchmark.tier }}</span>
    </div>

    <div class="bc-track">
      <div class="bc-line"></div>
      <div class="bc-marker bc-marker-avg" :style="{ left: `${averagePosition}%` }"></div>
      <div
        class="bc-marker bc-marker-player"
        :class="sentiment"
        :style="{ left: `${playerPosition}%` }"
      ></div>
    </div>

    <div class="bc-footer">
      <span class="bc-stat">AVG {{ formatNumber(Math.round(benchmark.avg)) }}</span>
      <span class="bc-delta" :class="sentiment">{{ delta }}</span>
    </div>

    <div class="bc-bounds">
      <div class="bc-bound"><span>MIN</span> {{ formatNumber(Math.round(benchmark.min)) }}</div>
      <div class="bc-bound"><span>MAX</span> {{ formatNumber(Math.round(benchmark.max)) }}</div>
    </div>
  </div>
</template>

<style scoped>
.bc-simple {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 700;
  color: var(--sys-color-on-surface);
  line-height: var(--sys-leading-tight);
}

.bc-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-10);
}

.bc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-8);
}

.bc-label {
  font-size: var(--sys-typescale-label-md);
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: var(--sys-tracking-wider);
  color: var(--sys-color-on-surface-variant);
}

.bc-tier {
  flex-shrink: 0;
  font-size: var(--sys-typescale-label-xs);
  font-weight: 900;
  letter-spacing: var(--sys-tracking-wider);
  text-transform: uppercase;
  padding: 2px var(--sys-space-8);
  border-radius: var(--sys-shape-corner-full);
}

.bc-tier.tier-elite {
  color: var(--sys-color-on-success-container);
  background: var(--sys-color-success-container);
}
.bc-tier.tier-top-tier {
  color: var(--sys-color-on-primary-container);
  background: var(--sys-color-primary-container);
}
.bc-tier.tier-growing {
  color: var(--sys-color-on-warning-container);
  background: var(--sys-color-warning-container);
}
.bc-tier.tier-under {
  color: var(--sys-color-on-error-container);
  background: var(--sys-color-error-container);
}

.bc-track {
  position: relative;
  height: 4px;
  border-radius: var(--sys-shape-corner-full);
  background: var(--sys-color-surface-container-highest);
}

.bc-line {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.bc-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
}

.bc-marker-avg {
  width: 2px;
  height: 10px;
  border-radius: 1px;
  background: var(--sys-color-outline);
}

.bc-marker-player {
  width: 10px;
  height: 10px;
  border: 2px solid var(--sys-surface-glass);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.bc-marker-player.better {
  background: var(--sys-color-success);
}
.bc-marker-player.worse {
  background: var(--sys-color-error);
}

.bc-footer {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.bc-stat {
  font-size: var(--sys-typescale-footer);
  font-weight: 800;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-on-surface-variant);
}

.bc-delta {
  font-size: var(--sys-typescale-body-sm);
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}
.bc-delta.better {
  color: var(--sys-color-success);
}
.bc-delta.worse {
  color: var(--sys-color-error);
}

.bc-bounds {
  display: flex;
  justify-content: space-between;
  padding-top: var(--sys-space-8);
  border-top: 1px solid var(--sys-surface-glass-border);
}

.bc-bound {
  font-size: var(--sys-typescale-meta);
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-on-surface-variant);
  display: flex;
  align-items: center;
  gap: var(--sys-space-4);
}

.bc-bound span {
  font-size: var(--sys-typescale-label-xs);
  font-weight: 850;
  letter-spacing: var(--sys-tracking-wider);
  color: var(--sys-color-outline);
}
</style>
