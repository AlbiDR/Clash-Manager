<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed, useId } from "vue";
import type { ScoreComposition, ScoreExplanationData } from "@core";
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";

const explanationId = useId();
const props = defineProps<{
  label: string;
  scoreName?: string;
  scoreComposition?: ScoreComposition;
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
const { benchmarkTooltipContent: scoreComparison } = useBenchmarkedStat(
  () => props.benchmarkType, "score", () => props.scoreComposition?.normalizedScore, () => props.loading,
);
const scoreExplanation = computed<ScoreExplanationData | null>(() => {
  if (!props.scoreComposition || !props.benchmarkType || props.loading) return null;
  return {
    kind: "score", name: props.scoreName || "", context: props.benchmarkType,
    score: props.scoreComposition.normalizedScore,
    composition: props.scoreComposition, comparison: scoreComparison.value,
  };
});
</script>

<template>
  <div
    v-if="props.loading"
    class="stat-item skeleton-anim"
  >
    <div class="label label-caption">
      <div class="sk-label-box" />
    </div>
    <div class="value">
      <div class="sk-value-box" />
    </div>
  </div>
  <component
    :is="scoreExplanation ? 'button' : 'div'"
    v-else
    :id="scoreExplanation ? `score-details-${explanationId}` : undefined"
    v-tooltip="scoreExplanation || benchmarkTooltipContent"
    :data-score-explanation="scoreExplanation ? '' : undefined"
    :type="scoreExplanation ? 'button' : undefined"
    class="stat-item hit-target"
    :aria-label="scoreExplanation ? `Explain ${props.label} for ${props.scoreName}` : `${props.label}: ${props.value}`"
  >
    <span
      class="label label-caption"
      :aria-hidden="'true'"
    >{{ props.label }}</span>
    <span
      class="value"
      :aria-hidden="'true'"
    >{{ props.value }}</span>
  </component>
</template>

<style scoped>
.stat-item {
  color: inherit;
  font: inherit;
  width: 100%;
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
  box-shadow: 0 1px 2px var(--sys-overlay-dark-subtle);
}
button.stat-item { cursor: pointer; min-height: var(--sys-space-48); }
button.stat-item:focus-visible { outline: var(--sys-space-2) solid var(--sys-color-primary); outline-offset: var(--sys-space-2); }

.stat-item:hover {
  /* Keep edge tiles inside the expanded card's outline. Scaling makes their
     border extend into the card edge and visibly clip when a card is selected. */
  transform: translateY(-2px);
  background: var(--sys-color-surface-container-high);
  box-shadow: 0 4px 12px var(--sys-overlay-dark-soft);
  z-index: 2;
}

.label {
  color: var(--sys-color-secondary);
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
  font-weight: 700;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  font-variant-numeric: tabular-nums;
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
