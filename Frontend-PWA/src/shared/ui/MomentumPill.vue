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
  padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  z-index: 2;
  border: 1px solid var(--sys-color-outline-variant);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  flex-shrink: 0;
}

:root.dark .momentum-pill {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.momentum-pill.up {
  color: #166534;
}

:root.dark .momentum-pill.up {
  color: #22c55e;
}

.momentum-pill.down {
  color: #991b1b;
}

:root.dark .momentum-pill.down {
  color: #ef4444;
}

.trend-val {
  font-size: 9px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
}
</style>
