<script setup lang="ts">
import {
  BaseCard,
  CardActions,
  TrophyBadge,
  ScoreBadge,
  TenureBadge,
  StatisticItem
} from "@shared";
import { computed, defineAsyncComponent } from "vue";
import type { LeaderboardMember } from "@core/types";
import {
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

// Formatters
const roleInfo = (role: string) => formatRole(role);
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :is-tagged="isTagged"
    :score="member.performanceScore"
    :aria-label="`${member.n}, score ${Math.round(member.performanceScore)}, ${roleInfo(member.d.role).label}`"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <TenureBadge :days="member.d.days" />
      <div class="badge role" :class="roleInfo(member.d.role).class">
        {{ roleInfo(member.d.role).label }}
      </div>
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ member.n }}</span>
      <TrophyBadge :value="member.t" context="lb" />
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <ScoreBadge
        :score="member.performanceScore"
        :dt="member.dt"
        :performance-raw-score="member.performanceRawScore"
        context="lb"
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
