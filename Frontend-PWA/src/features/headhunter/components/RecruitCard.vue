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
 * - **Layer:** Layer 3 Features (@features/headhunter)
 * - **Satisfaction:** Satisfies ADR Section II: Unified Layout and ADR Section III: Validation Boundaries.
 * - **Import Boundaries:** Consumes @shared UI primitives and @core utilities.
 *   Strictly isolated from other features (e.g., Roster, Laboratory).
 *
 * **Decision Log - Accessibility & Text Containment:**
 * - Computes spoken description combining name, rounded potential score, and discovery age.
 * - Applies `user-select: none` text selection containment to player names
 *   to prevent accidental text highlights during swipe gestures in Android WebView.
 * - Enforces explicit top margin on card actions within expanded view.
 */
import {
  BaseCard,
  CardActions,
  TrophyBadge,
  ScoreBadge,
  StatsGrid,
  StatisticItem,
  TagBadge,
  LongevityBadge,
  scoreTintStyle
} from "@shared";
import { computed } from "vue";
import type { Recruit, ConsoleCardMetadata } from "@core/types";
import { formatTimeAgo, formatNumber } from "@core";

/**
 * Component Props Interface Definition.
 *
 * @remarks
 * Extends `ConsoleCardMetadata` to include card state (expanded, selected, selectionMode, isTagged)
 * along with recruit identification and authoritative payload data.
 */
const props = defineProps<ConsoleCardMetadata & {
  /** Unique identifier for the recruit (Player Tag). */
  id: string;
  /** Authoritative recruit data object containing potential scores and activity metrics. */
  recruit: Recruit;
}>();

/**
 * Component Event Emission Contract.
 *
 * @remarks
 * Defines strict typed events emitted to parent headhunter view controllers.
 */
const emit = defineEmits<{
  /** Triggers card expansion/collapse when not in selection mode. */
  toggle: [];
  /** Triggers addition/removal from the batch selection queue. */
  "toggle-select": [];
}>();

/**
 * ACCESSIBILITY RESOLVER
 *
 * @remarks
 * Uses the authoritative longevity label provided by the backend when present,
 * falling back to calculating formatted time-ago from `recruit.d.ago`.
 *
 * @returns Formatted human-readable duration string indicating discovery age.
 */
const timeAgo = computed(() => props.recruit.longevityLabel || formatTimeAgo(props.recruit.d.ago));

/**
 * Spoken description of the recruit for accessibility screen readers and overlays.
 *
 * @remarks
 * [DECISION LOG] Mirrors `memberAccessibilityLabel` in MemberCard, which is the
 * sibling row on the roster console. RecruitCard previously lacked card-label,
 * causing screen readers to announce bare articles without player details.
 * Rounds potential score to whole numbers for clear speech synthesis without decimal noise.
 *
 * @returns Formatted accessibility string combining player name, potential score, and discovery age.
 */
const recruitAccessibilityLabel = computed(() => {
  const roundedPotentialScore = Math.round(props.recruit.potentialScore ?? 0);
  return `${props.recruit.n}, potential ${roundedPotentialScore}, found ${timeAgo.value}`;
});
</script>

<template>
  <BaseCard
    :id="props.id"
    data-bone="RecruitCard.card"
    :expanded="props.expanded"
    :selected="props.selected"
    :selection-mode="props.selectionMode"
    :is-tagged="props.isTagged"
    :score="props.recruit.potentialScore"
    :card-label="recruitAccessibilityLabel"
    :card-name="props.recruit.n"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- [SLOT] IDENTITY META: Semantic badges for discovery time and identification. -->
    <template #identity-meta>
      <LongevityBadge
        data-bone="RecruitCard.meta"
        :time="timeAgo"
      />
      <TagBadge
        :id="props.recruit.id"
        class="score-tint"
        :style="scoreTintStyle(props.recruit.potentialScore ?? 0)"
      />
    </template>

    <!-- [SLOT] IDENTITY NAME: Primary player identification and trophy count. -->
    <template #identity-name>
      <span
        class="player-name"
        data-bone="RecruitCard.name"
      >{{ props.recruit.n }}</span>
      <TrophyBadge
        :value="props.recruit.t"
        context="hh"
      />
    </template>

    <!-- [SLOT] SCORE SECTION: PoS (Potential Score) for recruitment prioritization. -->
    <template #score-section>
      <ScoreBadge
        :score="props.recruit.potentialScore"
        context="hh"
      />
    </template>

    <!-- [SLOT] EXPANDED CONTENT: Detailed recruitment metrics and actions. -->
    <template #expanded-content>
      <StatsGrid
        :columns="2"
        :loading="props.appIsRefreshing"
      >
        <StatisticItem
          label="Donations"
          :value="Math.round(props.recruit.d.don || 0)"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="donations"
          :benchmark-raw-value="props.recruit.d.don"
        />
        <StatisticItem
          label="Win Rate"
          :value="formatNumber(Math.min(props.recruit.d.winRate ?? 0, 1), { style: 'percent', maximumFractionDigits: 1 })"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="winRate"
          :benchmark-raw-value="props.recruit.d.winRate ?? 0"
        />

        <StatisticItem
          label="Cards Won"
          :value="props.recruit.d.cards || 0"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="cardsWon"
          :benchmark-raw-value="props.recruit.d.cards || 0"
        />
        <StatisticItem
          label="War Wins"
          :value="props.recruit.d.war || 0"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="warWins"
          :benchmark-raw-value="props.recruit.d.war || 0"
        />
        <StatisticItem
          label="RPoS"
          :value="formatNumber(props.recruit.potentialRawScore, { maximumFractionDigits: 0 })"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="rawScore"
          :benchmark-raw-value="props.recruit.potentialRawScore"
        />
        <StatisticItem
          label="Last Scan"
          :value="props.recruit.lastScan ? formatTimeAgo(props.recruit.lastScan) : '-'"
          :loading="props.appIsRefreshing"
          benchmark-type="hh"
          benchmark-metric="lastScan"
          :benchmark-raw-value="props.recruit.lastScan ? Math.max(0, Math.floor((Date.now() - props.recruit.lastScan) / 60000)) : undefined"
        />
      </StatsGrid>

      <CardActions
        :id="props.recruit.id"
        class="card-actions-margin"
        :loading="props.appIsRefreshing"
        compact
      />
    </template>
  </BaseCard>
</template>

<style scoped>
/* Content specific styles only */

.player-name {
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
}

.card-actions-margin {
  margin-top: var(--sys-space-16);
}
</style>
