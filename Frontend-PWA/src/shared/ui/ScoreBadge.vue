// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
import MomentumPill from "./MomentumPill.vue";
import { useBenchmarking } from "@core/services/useBenchmarking";
import { computed } from "vue";

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
  /** Optional: Trend delta (dt) for momentum display */
  dt?: number;
  /** Optional: Raw performance score for momentum display */
  performanceRawScore?: number;
}>();

const { getSafeBenchmark } = useBenchmarking();

const tooltipVal = computed(() => {
  return getSafeBenchmark(props.context, "score", props.score);
});
</script>

<template>
  <div class="score-badge-wrapper">
    <span
      class="stat-score"
      v-tooltip="tooltipVal"
    >
      {{ Math.round(props.score || 0) }}
    </span>

    <MomentumPill
      v-if="props.context === 'lb' && props.dt !== undefined"
      :dt="props.dt"
      :performance-raw-score="props.performanceRawScore"
    />
  </div>
</template>

<style scoped>
.score-badge-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.stat-score {
  font-size: 18px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  line-height: 1;
}
</style>
