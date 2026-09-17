// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import { computed } from "vue";
import MomentumPill from "./MomentumPill.vue";
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";

/**
 * [UI] SCORE BADGE
 * Standardized component for displaying player scores with benchmarking tooltips
 * and optional momentum tracking for the Roster view.
 */
const props = defineProps<{
  /** Current performance or potential score */
  score: number | undefined;
  /** Context for benchmarking ('lb' for Leaderboard, 'hh' for Headhunter) */
  context: "lb" | "hh";
  /** Optional: Trend delta (scoreDelta) for momentum display */
  scoreDelta?: number;
  /** Optional: Raw performance score for momentum display */
  performanceRawScore?: number;
}>();

const { benchmarkTooltipContent } = useBenchmarkedStat(
  () => props.context,
  "score",
  () => props.score
);

/**
 * A score is much more useful when it carries its relative standing. The
 * detailed benchmark remains available in the tooltip; this compact tier is
 * the immediate scan cue for a list of otherwise similar scores.
 */
const scoreTier = computed(() => benchmarkTooltipContent.value?.tier);
</script>

<template>
  <div class="score-badge-wrapper">
    <span
      v-if="scoreTier"
      class="score-tier"
      :class="`is-${scoreTier.toLowerCase().replace(/\\s+/g, '-')}`"
      aria-hidden="true"
    >{{ scoreTier }}</span>
    <span
      v-tooltip="benchmarkTooltipContent"
      class="stat-score"
    >
      {{ Math.round(props.score || 0) }}
    </span>

    <MomentumPill
      v-if="props.context === 'lb' && props.scoreDelta !== undefined"
      :score-delta="props.scoreDelta"
      :performance-raw-score="props.performanceRawScore"
      class="momentum-overlay"
    />
  </div>
</template>

<style scoped>
.score-badge-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.stat-score {
  position: absolute;
  top: 54%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--sys-typescale-score);
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  line-height: var(--sys-leading-none);
}

.score-tier {
  position: absolute;
  top: 5px;
  left: 50%;
  max-width: calc(100% - var(--sys-space-8));
  overflow: hidden;
  color: currentColor;
  font-family: var(--sys-font-family-mono);
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1;
  text-align: center;
  text-overflow: ellipsis;
  text-transform: uppercase;
  transform: translateX(-50%);
  white-space: nowrap;
  opacity: 0.7;
}

.score-tier.is-under { opacity: 0.58; }

.momentum-overlay {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  /* Ensure the pill doesn't interfere with score interactions */
  pointer-events: auto;
}
</style>
