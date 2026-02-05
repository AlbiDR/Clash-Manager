<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { LeaderboardMember } from "../types";
import Icon from "./Icon.vue";
import BaseCard from "./BaseCard.vue";
import { useBenchmarking } from "../composables/useBenchmarking";
import { useAppSettings } from "../composables/useAppSettings";
import {
  getScoreTone,
  formatRole,
  formatTimeAgo,
  calculateMomentum,
} from "../utils/formatters";
import StatisticItem from "./StatisticItem.vue";
import CardActions from "./CardActions.vue";

const WarHistoryChart = defineAsyncComponent(
  () => import("./WarHistoryChart.vue"),
);

const {
  id,
  member,
  expanded,
  selected,
  selectionMode,
  appIsRefreshing = false,
} = defineProps<{
  id: string;
  member: LeaderboardMember;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  isTagged?: boolean;
  appIsRefreshing?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "toggle-select": [];
}>();

const { getBenchmark } = useBenchmarking();
const { modules } = useAppSettings();

// Formatters
const roleInfo = (role: string) => formatRole(role);
const scoreTone = (score: number) => getScoreTone(score);

const trendInfo = computed(() => {
  const dt = Number(member.dt) || 0;
  const currentRaw = Number(member.performanceRawScore) || 0;
  return calculateMomentum(dt, currentRaw);
});
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :is-tagged="isTagged"
    :tone-class="scoreTone(member.performanceScore)"
    :aria-label="`${member.n}, score ${Math.round(member.performanceScore)}, ${roleInfo(member.d.role).label}`"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <div
        class="badge tenure hit-target"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'tenure', member.d.days)
            : null
        "
      >
        {{ member.d.days }}d
      </div>
      <div class="badge role" :class="roleInfo(member.d.role).class">
        {{ roleInfo(member.d.role).label }}
      </div>
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ member.n }}</span>
      <div
        class="trophy-meta hit-target"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'trophies', member.t)
            : null
        "
      >
        <Icon name="trophy" size="12" />
        <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
      </div>
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <span
        class="stat-score"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'score', member.performanceScore)
            : null
        "
        >{{ Math.round(member.performanceScore || 0) }}</span
      >
      <div
        v-if="trendInfo"
        class="momentum-pill hit-target"
        :class="trendInfo.dir"
        v-tooltip="
          modules.ghostBenchmarking
            ? getBenchmark('lb', 'momentum', trendInfo.raw)
            : null
        "
      >
        <Icon
          :name="trendInfo.dir === 'up' ? 'trend_up' : 'trend_down'"
          size="10"
        />
        <span class="trend-val">{{ trendInfo.val }}</span>
      </div>
    </template>

    <!-- Expanded Content -->
    <template #expanded-content>
      <div
        class="stats-grid lb-grid"
        :aria-busy="appIsRefreshing"
      >
        <StatisticItem
          label="War Rate"
          :value="member.d.rate || '0%'"
          :loading="appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="warRate"
          :benchmark-raw-value="parseFloat(member.d.rate || '0')"
        />
        <StatisticItem
          label="Average Fame"
          :loading="appIsRefreshing"
          :value="(member.d.wfame || 0).toLocaleString()"
        />
        <StatisticItem
          label="Daily Donations"
          :value="member.d.avg"
          :loading="appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="donations"
          :benchmark-raw-value="member.d.avg"
        />
        <StatisticItem
          label="Last Seen"
          :loading="appIsRefreshing"
          :value="formatTimeAgo(member.d.seen)"
        />
      </div>

      <WarHistoryChart :history="member.d.hist" :loading="appIsRefreshing" />

      <CardActions
        class="card-actions-margin"
        :id="member.id"
        :loading="appIsRefreshing"
      />
    </template>
  </BaseCard>
</template>

<style scoped>
/* Content specific styles only */
.badge.role {
  font-family: var(--sys-font-family-body);
  font-weight: 900;
  font-size: 9px;
}

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
  transition: transform 0.2s ease, box-shadow 0.2s ease;
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

/* Expanded Content Layout */
.lb-grid {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 360px) {
  .lb-grid {
    gap: 6px;
  }
}

.card-actions-margin {
  margin-top: 16px;
}
</style>
