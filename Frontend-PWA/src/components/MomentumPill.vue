<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import { useBenchmarking } from "../composables/useBenchmarking";
import { calculateMomentum } from "../utils/formatters";

/**
 * MomentumPill Component
 *
 * Extracts and displays the trend momentum (Raw Score Delta) for a player.
 * Automatically handles visibility and benchmarking tooltips.
 */

const props = defineProps<{
  /** Raw score delta (dt) */
  dt: number | undefined;
  /** Current raw performance score */
  performanceRawScore: number | undefined;
}>();

const { getSafeBenchmark } = useBenchmarking();

const trendInfo = computed(() => {
  const dt = Number(props.dt) || 0;
  const currentRaw = Number(props.performanceRawScore) || 0;
  return calculateMomentum(dt, currentRaw);
});

const tooltipVal = computed(() => {
  return getSafeBenchmark("lb", "momentum", trendInfo.value?.raw);
});
</script>

<template>
  <div
    v-if="trendInfo"
    class="momentum-pill hit-target"
    :class="trendInfo.dir"
    v-tooltip="tooltipVal"
  >
    <Icon
      :name="trendInfo.dir === 'up' ? 'trend_up' : 'trend_down'"
      size="10"
    />
    <span class="trend-val">{{ trendInfo.val }}</span>
  </div>
</template>

<style scoped>
.momentum-pill {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  height: 18px;
  padding: 0 6px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
  z-index: 10;
  border: 1px solid var(--sys-color-outline-variant);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
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
