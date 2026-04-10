// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * [FEATURE] RECRUIT CARD
 * ----------------------------------------------------------------------------
 * Rationale: Orchestration component for displaying prospective clan recruits.
 * Layer: @features/headhunter
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * This component acts as the primary interface for evaluating a recruit's
 * potential. It delegates layout and interaction (expansion/selection) to the
 * `BaseCard` molecule and populates it with domain-specific metrics from the
 * Headhunter feature.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Import Boundaries:** Consumes @shared UI primitives and @core utilities.
 *   Strictly isolated from other features (e.g., Roster, Laboratory).
 */
import {
  BaseCard,
  CardActions,
  TrophyBadge,
  ScoreBadge,
  StatsGrid,
  StatisticItem
} from "@shared";
import { computed } from "vue";
import type { Recruit } from "@core/types";
import { formatTimeAgo } from "@core/utils/formatters";

const {
  id,
  recruit,
  expanded,
  selected,
  selectionMode,
  isTagged = false,
  appIsRefreshing = false,
} = defineProps<{
  /** Unique identifier for the recruit (Player Tag). */
  id: string;
  /** Authoritative recruit data object containing potential scores and activity metrics. */
  recruit: Recruit;
  /** UI State: Controls the expansion of detailed performance statistics. */
  expanded: boolean;
  /** UI State: Indicates if the card is currently in the selection queue. */
  selected: boolean;
  /** UI State: Toggles between interaction modes (Details vs. Batch Action). */
  selectionMode: boolean;
  /** Optional: Indicates if the player is currently tagged for an action. */
  isTagged?: boolean;
  /** Optional: Inherited refresh status to manage loading skeletons and accessibility states. */
  appIsRefreshing?: boolean;
}>();

const emit = defineEmits<{
  /** Triggers card expansion/collapse when not in selection mode. */
  toggle: [];
  /** Triggers addition/removal from the batch selection queue. */
  "toggle-select": [];
}>();

/**
 * ACCESSIBILITY RESOLVER
 * Converts the raw 'ago' timestamp into a human-readable duration since last sighting.
 */
const timeAgo = computed(() => formatTimeAgo(recruit.d.ago));
</script>

<template>
  <BaseCard
    :id="id"
    :expanded="expanded"
    :selected="selected"
    :selection-mode="selectionMode"
    :is-tagged="isTagged"
    :score="recruit.potentialScore"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- [SLOT] IDENTITY META: Semantic badges for discovery time and identification. -->
    <template #identity-meta>
      <div class="badge time">{{ timeAgo }}</div>
      <div class="badge tag">#{{ recruit.id.substring(0, 5) }}</div>
    </template>

    <!-- [SLOT] IDENTITY NAME: Primary player identification and trophy count. -->
    <template #identity-name>
      <span class="player-name">{{ recruit.n }}</span>
      <TrophyBadge :value="recruit.t" context="hh" />
    </template>

    <!-- [SLOT] SCORE SECTION: PoS (Potential Score) for recruitment prioritization. -->
    <template #score-section>
      <ScoreBadge :score="recruit.potentialScore" context="hh" />
    </template>

    <!-- [SLOT] EXPANDED CONTENT: Detailed recruitment metrics and actions. -->
    <template #expanded-content>
      <StatsGrid :columns="3" :loading="appIsRefreshing">
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
      </StatsGrid>

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

.card-actions-margin {
  margin-top: 8px;
}
</style>
