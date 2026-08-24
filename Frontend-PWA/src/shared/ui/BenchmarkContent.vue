<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import { formatNumber, formatTimeAgo } from "../../core";
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
  /**
   * Authoritative data payload representing a BenchmarkData object or a simple informational string.
   */
  data: BenchmarkData | string;
}>();

/**
 * Extracts and returns the structured BenchmarkData if the prop payload is not a simple string.
 */
const benchmark = computed(() =>
  typeof props.data === "string" ? null : props.data,
);

// [DECISION LOG] Plain-string tooltips (e.g. chart bar labels) use a "label\nvalue"
// convention instead of embedded HTML, since this content renders via safe text
// interpolation below, never innerHTML/v-html.
/**
 * Splits plain-text tooltip payloads by line breaks for structured text interpolation in the UI.
 */
const simpleLines = computed(() =>
  typeof props.data === "string" ? props.data.split("\n") : [],
);

/**
 * Clamps numeric values strictly between 0 and 100 representing visual percentages.
 *
 * @param value - Input percentage value.
 * @returns Clamped visual percentage.
 */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Formats benchmark values according to the metric's domain.
 */
function formatBenchmarkValue(value: number): string {
  const format = benchmark.value?.format || "number";
  if (format === "percent") {
    return formatNumber(value, { style: "percent", maximumFractionDigits: 1 });
  }
  if (format === "durationMinutes") {
    return formatTimeAgo(Date.now() - value * 60_000);
  }
  return formatNumber(Math.round(value));
}

/**
 * Formats the benchmark tier into a lowercase, hyphenated CSS-safe slug (e.g., "top-tier").
 */
const tierSlug = computed(() =>
  benchmark.value ? benchmark.value.tier.toLowerCase().replace(/\s+/g, "-") : "",
);

/**
 * Calculates the numeric range between maximum and minimum boundaries to scale visual indicators.
 */
const range = computed(() =>
  benchmark.value ? benchmark.value.max - benchmark.value.min || 1 : 1,
);

/**
 * Determines the relative horizontal position percentage for the player marker on the range track.
 */
const playerPosition = computed(() =>
  benchmark.value
    ? clampPercent(((benchmark.value.value - benchmark.value.min) / range.value) * 100)
    : 0,
);

/**
 * Determines the relative horizontal position percentage for the average marker on the range track.
 */
const averagePosition = computed(() =>
  benchmark.value
    ? clampPercent(((benchmark.value.avg - benchmark.value.min) / range.value) * 100)
    : 0,
);

/**
 * Resolves the visual sentiment class based on player performance relative to averages.
 */
const sentiment = computed(() => (benchmark.value?.isBetter ? "better" : "worse"));

/**
 * Generates the performance delta percentage display string, prepended with a signed operator.
 */
const delta = computed(() =>
  benchmark.value
    ? `${benchmark.value.isBetter ? "+" : "-"}${benchmark.value.percent}%`
    : "",
);
</script>

<template>
  <div
    v-if="!benchmark && simpleLines.length > 1"
    class="bc-simple-rich"
  >
    <span class="bc-simple-label">{{ simpleLines[0] }}</span>
    <span class="bc-simple-value">{{ simpleLines[1] }}</span>
  </div>
  <div
    v-else-if="!benchmark"
    class="bc-simple"
  >
    {{ data }}
  </div>
  <div
    v-else
    class="bc-panel"
  >
    <div class="bc-header">
      <span class="bc-label">{{ benchmark.label }}</span>
      <span
        class="bc-tier"
        :class="`tier-${tierSlug}`"
      >{{ benchmark.tier }}</span>
    </div>

    <div class="bc-track">
      <div class="bc-line" />
      <div
        class="bc-marker bc-marker-avg"
        :style="{ left: `${averagePosition}%` }"
      />
      <div
        class="bc-marker bc-marker-player"
        :class="sentiment"
        :style="{ left: `${playerPosition}%` }"
      />
    </div>

    <div class="bc-footer">
      <span class="bc-stat">AVG {{ formatBenchmarkValue(benchmark.avg) }}</span>
      <span
        class="bc-delta"
        :class="sentiment"
      >{{ delta }}</span>
    </div>

    <div class="bc-bounds">
      <div class="bc-bound">
        <span>MIN</span> {{ formatBenchmarkValue(benchmark.min) }}
      </div>
      <div class="bc-bound">
        <span>MAX</span> {{ formatBenchmarkValue(benchmark.max) }}
      </div>
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

.bc-simple-rich {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
}

.bc-simple-label {
  font-size: var(--sys-typescale-label-md);
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: var(--sys-tracking-wider);
  color: var(--sys-color-on-surface-variant);
}

.bc-simple-value {
  font-size: var(--sys-typescale-body-md);
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-on-surface);
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
