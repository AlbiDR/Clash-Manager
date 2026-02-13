<script setup lang="ts">
import { computed } from "vue";
import type { Recruit } from "../types";
import Icon from "./Icon.vue";
import BaseCard from "./BaseCard.vue";
import { useBenchmarking } from "../composables/useBenchmarking";
import { getScoreTone, formatTimeAgo } from "../utils/formatters";
import StatisticItem from "./StatisticItem.vue";
import CardActions from "./CardActions.vue";

const {
  id,
  recruit,
  expanded,
  selected,
  selectionMode,
  appIsRefreshing = false,
} = defineProps<{
  id: string;
  recruit: Recruit;
  expanded: boolean;
  selected: boolean;
  selectionMode: boolean;
  appIsRefreshing?: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "toggle-select": [];
}>();

const { getSafeBenchmark } = useBenchmarking();

const toneClass = computed(() => getScoreTone(recruit.potentialScore));
const timeAgo = computed(() => formatTimeAgo(recruit.d.ago));
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :tone-class="toneClass"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- SLOT: Meta Stack -->
    <template #identity-meta>
      <div class="badge time">{{ timeAgo }}</div>
      <div class="badge tag">#{{ recruit.id.substring(0, 5) }}</div>
    </template>

    <!-- SLOT: Name Block -->
    <template #identity-name>
      <span class="player-name">{{ recruit.n }}</span>
      <div
        class="trophy-meta hit-target"
        v-tooltip="getSafeBenchmark('hh', 'trophies', recruit.t)"
      >
        <Icon name="trophy" size="12" />
        <span class="trophy-val">{{ (recruit.t || 0).toLocaleString() }}</span>
      </div>
    </template>

    <!-- SLOT: Score Section -->
    <template #score-section>
      <span
        class="stat-score"
        v-tooltip="getSafeBenchmark('hh', 'score', recruit.potentialScore)"
        >{{ Math.round(recruit.potentialScore || 0) }}</span
      >
    </template>

    <!-- SLOT: Expanded Content -->
    <template #expanded-content>
      <div class="stats-grid hh-grid" :aria-busy="appIsRefreshing">
        <StatisticItem
          label="Donations"
          :value="recruit.d.don"
          :loading="appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="donations"
          :benchmark-raw-value="recruit.d.don"
        />
        <StatisticItem
          label="War Wins"
          :value="recruit.d.war"
          :loading="appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="warWins"
          :benchmark-raw-value="recruit.d.war"
        />
        <StatisticItem
          label="Cards Won"
          :value="recruit.d.cards || '-'"
          :loading="appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="cardsWon"
          :benchmark-raw-value="recruit.d.cards || 0"
        />
      </div>

      <CardActions
        class="card-actions-margin"
        :id="recruit.id"
        :loading="appIsRefreshing"
        compact
      />
    </template>
  </BaseCard>
</template>

<style scoped>
/* Content specific styles only */

/* Expanded Content Layout */
.hh-grid {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 380px) {
  .hh-grid {
    gap: 4px;
  }
}

.card-actions-margin {
  margin-top: 8px;
}
</style>
