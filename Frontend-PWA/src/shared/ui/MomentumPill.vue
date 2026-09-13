<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import { useBenchmarkedStat } from "../composables/useBenchmarkedStat";
import { computed } from "vue";
import { calculateMomentum } from "@core";

/**
 * MomentumPill Component
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared UI (@shared/ui)
 * - **Role:** Presentation. Extracts and displays the trend momentum (Raw Score Delta) for a player.
 *   Automatically handles visibility and benchmarking tooltips.
 */

const props = defineProps<{
  /** Raw score delta (scoreDelta) */
  scoreDelta: number | undefined;
  /** Current raw performance score */
  performanceRawScore: number | undefined;
}>();

const trendInfo = computed(() => {
  const scoreDelta = Number(props.scoreDelta) || 0;
  const currentRaw = Number(props.performanceRawScore) || 0;
  return calculateMomentum(scoreDelta, currentRaw);
});

const { benchmarkTooltipContent } = useBenchmarkedStat(
  "lb",
  "momentum",
  () => trendInfo.value?.raw
);
</script>

<template>
  <div
    v-if="trendInfo"
    v-tooltip="benchmarkTooltipContent"
    class="momentum-pill"
    :class="trendInfo.dir"
  >
    <Icon
      :name="trendInfo.dir === 'up' ? 'trend_up' : 'trend_down'"
      size="10"
    />
    <span class="trend-val">{{ trendInfo.momentumLabel }}</span>
  </div>
</template>

<style scoped>
.momentum-pill {
  height: 18px;
  padding: 0 var(--sys-space-6);
  background: var(--sys-color-surface-container-highest);
  border-radius: var(--sys-shape-corner-stat);
  display: flex;
  align-items: center;
  gap: var(--sys-space-2);
  box-shadow: 0 2px 4px var(--sys-overlay-dark-soft);
  z-index: 2;
  border: 1px solid var(--sys-color-outline-variant);
  transition:
    transform var(--sys-motion-duration-200) ease,
    box-shadow var(--sys-motion-duration-200) ease;
  flex-shrink: 0;
}

:root.dark .momentum-pill {
  border-color: var(--sys-overlay-light-soft);
  box-shadow: 0 4px 12px var(--sys-overlay-dark-strong);
}

/* [DECISION LOG] THE PALETTE ALREADY KNEW WHAT UP AND DOWN LOOK LIKE:
   These four rules were a second, private implementation of theming. Raw hex
   cannot respond to the theme, so this component re-derived by hand what the
   token layer already resolves per theme - and landed within a few points of
   it: its light green #166534 against --sys-color-success at #145218, its light
   red #991b1b against --sys-color-error at #ba1a1a. Two sources of truth for
   what green means, agreeing today by coincidence and free to drift tomorrow,
   with the :root.dark overrides existing only to paper over the first mistake.
   The tokens carry both themes, so both overrides go. */
.momentum-pill.up {
  color: var(--sys-color-success);
}

.momentum-pill.down {
  color: var(--sys-color-error);
}

.trend-val {
  font-size: 9px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
}
</style>
