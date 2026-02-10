import { BaseCard, CardActions, Icon, MomentumPill, StatisticItem } from "@shared";
import { useAppSettings, useBenchmarking } from "@core";
<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";
import type { LeaderboardMember } from "@core/types";
import {
  getScoreTone,
  formatRole,
  formatTimeAgo,
} from "@core/utils/formatters";
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

const { getSafeBenchmark } = useBenchmarking();
const { modules } = useAppSettings();

// Formatters
const roleInfo = (role: string) => formatRole(role);
const scoreTone = (score: number) => getScoreTone(score);
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
        v-tooltip="getSafeBenchmark('lb', 'tenure', member.d.days)"
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
        v-tooltip="getSafeBenchmark('lb', 'trophies', member.t)"
      >
        <Icon name="trophy" size="12" />
        <span class="trophy-val">{{ (member.t || 0).toLocaleString() }}</span>
      </div>
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <span
        class="stat-score"
        v-tooltip="getSafeBenchmark('lb', 'score', member.performanceScore)"
        >{{ Math.round(member.performanceScore || 0) }}</span
      >
      <MomentumPill
        :dt="member.dt"
        :performance-raw-score="member.performanceRawScore"
      />
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
