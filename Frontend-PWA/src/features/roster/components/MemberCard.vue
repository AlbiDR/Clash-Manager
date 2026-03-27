<script setup lang="ts">
import {
  BaseCard,
  CardActions,
  TrophyBadge,
  ScoreBadge,
  RoleBadge,
  TenureBadge,
  StatsGrid,
  StatisticItem
} from "@shared";
import { computed, defineAsyncComponent } from "vue";
import type { LeaderboardMember } from "@core/types";
import { formatRole, formatTimeAgo } from "@core/utils/formatters";
const WarHistoryChart = defineAsyncComponent(
  () => import("./WarHistoryChart.vue"),
);

const props = defineProps<{
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

const ariaLabel = computed(() => {
  const roleLabel = formatRole(props.member.d.role).label;
  return `${props.member.n}, score ${Math.round(props.member.performanceScore)}, ${roleLabel}`;
});
</script>

<template>
  <BaseCard
    :id="props.id"
    :expanded="props.expanded"
    :selected="props.selected"
    :selection-mode="props.selectionMode"
    :is-tagged="props.isTagged"
    :score="props.member.performanceScore"
    :aria-label="ariaLabel"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <TenureBadge :days="props.member.d.days" />
      <RoleBadge :role="props.member.d.role" />
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ props.member.n }}</span>
      <TrophyBadge :value="props.member.t" context="lb" />
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <ScoreBadge
        :score="props.member.performanceScore"
        :dt="props.member.dt"
        :performance-raw-score="props.member.performanceRawScore"
        context="lb"
      />
    </template>

    <!-- Expanded Content -->
    <template #expanded-content>
      <StatsGrid
        :columns="2"
        :loading="props.appIsRefreshing"
      >
        <StatisticItem
          label="War Rate"
          :value="props.member.d.rate || '0%'"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="warRate"
          :benchmark-raw-value="parseFloat(props.member.d.rate || '0')"
        />
        <StatisticItem
          label="Average Fame"
          :loading="props.appIsRefreshing"
          :value="(props.member.d.wfame || 0).toLocaleString()"
        />
        <StatisticItem
          label="Daily Donations"
          :value="props.member.d.avg"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="donations"
          :benchmark-raw-value="props.member.d.avg"
        />
        <StatisticItem
          label="Last Seen"
          :loading="props.appIsRefreshing"
          :value="formatTimeAgo(props.member.d.seen)"
        />
      </StatsGrid>

      <WarHistoryChart :history="props.member.d.hist" :loading="props.appIsRefreshing" />

      <CardActions
        class="card-actions-margin"
        :id="props.member.id"
        :loading="props.appIsRefreshing"
      />
    </template>
  </BaseCard>
</template>

<style scoped>
/* Content specific styles only */

.card-actions-margin {
  margin-top: 16px;
}
</style>
