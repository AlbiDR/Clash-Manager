// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * COMPONENT: MemberCard.vue
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative presentation component for clan roster members.
 * Layer: @features/roster
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Orchestrates the `BaseCard` molecule by injecting domain-specific member data
 * into standardized slots. Integrates with the `WarHistoryChart` feature-component
 * for performance visualization and `CardActions` for roster management.
 *
 * **Architectural Context:**
 * - Layer: Layer 3 Features (@features/roster)
 * - Satisfaction: Satisfies ADR Section II: Unified Layout and ADR Section IV: Operational Resilience.
 *
 * **Decision Log - Chart Toggling, Layout Spacing & Text Containment:**
 * - Provides interactive chart selection toggling between River War and Voyage histories.
 * - Applies `user-select: none` text selection containment to player names (Target A.3)
 *   to prevent accidental text highlights during swipe gestures in Android WebView.
 * - Enforces explicit vertical spacing margins between expanded statistics grid sections.
 */
import {
  BaseCard,
  CardActions,
  TrophyBadge,
  ScoreBadge,
  RoleBadge,
  TenureBadge,
  StatsGrid,
  StatisticItem,
  WarHistoryChart,
  VoyageHistoryChart,
  BaseSegmentedControl,
  Icon,
  formatRole,
} from "@shared";
import { computed, ref } from "vue";
import type { LeaderboardMember, ConsoleCardMetadata } from "@core/types";
import { formatTimeAgo, formatNumber, parseTimeAgoValue } from "@core";

/**
 * Reactive chart selection state toggling active history visualization.
 *
 * @remarks
 * Switches between River War (`war`) and Voyage (`voyage`) history charts within the expanded card body.
 *
 * [DECISION LOG] Defaults to 'war' (River War) as the primary clan performance metric.
 */
const activeChartMode = ref<"war" | "voyage">("war");

/**
 * History is decision-relevant roster evidence, so it begins open with the
 * rest of an expanded card. The disclosure lets an operator compact history
 * across roster cards for the rest of the current session.
 */
/**
 * Component Props Interface Definition.
 *
 * @remarks
 * Extends `ConsoleCardMetadata` to include card state (expanded, selected, selectionMode, isTagged)
 * along with member identification and leaderboard payload data.
 */
const props = withDefaults(defineProps<ConsoleCardMetadata & {
  /** Unique player tag identifier. */
  id: string;
  /** Authoritative member data object from the Leaderboard dataset. */
  member: LeaderboardMember;
  /** Shared roster-session preference for the performance-history disclosure. */
  historyOpen?: boolean;
}>(), {
  historyOpen: true,
});

/**
 * Component Event Emission Contract.
 *
 * @remarks
 * Defines strict typed events emitted to parent roster view controllers.
 */
const emit = defineEmits<{
  /** Triggers card expansion/collapse when not in selection mode. */
  toggle: [];
  /** Triggers addition/removal from the batch selection queue. */
  "toggle-select": [];
  /** Updates the shared roster-session performance-history preference. */
  "update:history-open": [open: boolean];
}>();

const isHistoryOpen = computed(() => props.historyOpen);

const historyActionLabel = computed(() =>
  isHistoryOpen.value ? "Hide performance history" : "Show performance history",
);

function toggleHistory() {
  emit("update:history-open", !isHistoryOpen.value);
}

/**
 * ACCESSIBILITY RESOLVER
 *
 * @remarks
 * Constructs a semantic description of the member for screen readers and screen overlays.
 * [DECISION LOG] Formats member role and rounds performance score to whole numbers for clear speech synthesis.
 *
 * @returns Formatted accessibility string combining player name, score, and hierarchy role.
 */
const memberAccessibilityLabel = computed(() => {
  // Extract human-readable role label from standardized role formatting utility
  const memberRoleDescriptor = formatRole(props.member.d.role).label;
  // Round score to avoid decimal ambiguity in screen-reader speech synthesis
  const roundedPerformanceScore = Math.round(props.member.performanceScore);
  return `${props.member.n}, score ${roundedPerformanceScore}, ${memberRoleDescriptor}`;
});
</script>

<template>
  <BaseCard
    :id="props.id"
    data-bone="MemberCard.card"
    :expanded="props.expanded"
    :selected="props.selected"
    :selection-mode="props.selectionMode"
    :is-tagged="props.isTagged"
    :score="props.member.performanceScore"
    :card-label="memberAccessibilityLabel"
    :card-name="props.member.n"
    :score-summary="`Performance score ${Math.round(props.member.performanceScore)}`"
    @toggle="emit('toggle')"
    @toggle-select="emit('toggle-select')"
  >
    <!-- [SLOT] IDENTITY META: Semantic badges for clan tenure and hierarchy role. -->
    <template #identity-meta>
      <TenureBadge
        data-bone="MemberCard.meta"
        :days="props.member.d.days"
        context="lb"
      />
      <RoleBadge :role="props.member.d.role" />
    </template>

    <!-- [SLOT] IDENTITY NAME: Primary player identification and current trophy count. -->
    <template #identity-name>
      <span
        class="player-name"
        data-bone="MemberCard.name"
      >{{ props.member.n }}</span>
      <TrophyBadge
        :value="props.member.t"
        context="lb"
      />
    </template>

    <!-- [SLOT] SCORE SECTION: PeS (Performance Score) and momentum tracking. -->
    <template #score-section>
      <ScoreBadge
        :score="props.member.performanceScore"
        :score-delta="props.member.dt"
        :performance-raw-score="props.member.performanceRawScore"
        context="lb"
      />
    </template>

    <!-- [SLOT] EXPANDED CONTENT: Detailed performance metrics, war history, and actions. -->
    <template #expanded-content>
      <StatsGrid
        :columns="2"
        :loading="props.appIsRefreshing"
        priority="primary"
        label="Score drivers"
        detail="Recent clan contribution"
      >
        <StatisticItem
          label="War Rate"
          :value="props.member.d.rate != null ? props.member.d.rate : '0%'"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="warRate"
          :benchmark-raw-value="parseFloat(props.member.d.rate || '0')"
        />
        <StatisticItem
          label="Average Fame"
          :loading="props.appIsRefreshing"
          :value="formatNumber(props.member.d.wfame)"
          benchmark-type="lb"
          benchmark-metric="avgFame"
          :benchmark-raw-value="props.member.d.wfame"
        />
        <StatisticItem
          label="Avg. Donations"
          :value="Math.round(props.member.d.avg || 0)"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="donations"
          :benchmark-raw-value="props.member.d.avg"
        />
        <StatisticItem
          label="Last Seen"
          :loading="props.appIsRefreshing"
          :value="formatTimeAgo(props.member.d.seen)"
          benchmark-type="lb"
          benchmark-metric="lastSeen"
          :benchmark-raw-value="parseTimeAgoValue(props.member.d.seen)"
        />
      </StatsGrid>

      <!-- [SLOT] LIFETIME KPIS: Heritage-scale metrics (RPeS, recent Win Rate), -->
      <!-- visually separated from the active 2x2 grid above via wider spacing. -->
      <StatsGrid
        :columns="2"
        :loading="props.appIsRefreshing"
        class="lifetime-grid-margin"
        label="Score foundations"
        detail="Proven record"
      >
        <StatisticItem
          label="RPeS"
          :value="formatNumber(props.member.performanceRawScore, { maximumFractionDigits: 0 })"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="rawScore"
          :benchmark-raw-value="props.member.performanceRawScore"
        />
        <StatisticItem
          label="Win Rate"
          :value="formatNumber(Math.min(props.member.d.winRate, 1), { style: 'percent', maximumFractionDigits: 1 })"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="winRate"
          :benchmark-raw-value="props.member.d.winRate"
        />
      </StatsGrid>

      <section
        class="history-section"
        aria-label="Performance history"
      >
        <button
          v-tactile
          type="button"
          class="history-trigger hit-target"
          :aria-expanded="isHistoryOpen"
          :aria-label="historyActionLabel"
          @click.stop="toggleHistory"
        >
          <span class="history-heading">
            <span class="history-heading-label">Performance history</span>
            <span class="history-heading-detail">War and Voyage trend</span>
          </span>
          <span class="history-action">
            <span class="history-action-label">{{ isHistoryOpen ? "Hide history" : "Show history" }}</span>
            <Icon
              name="chevron_down"
              size="20"
              class="history-chevron"
              :class="{ 'is-open': isHistoryOpen }"
            />
          </span>
        </button>

        <Transition name="history-details">
          <div
            v-if="isHistoryOpen"
            class="history-details-reveal"
          >
            <div class="history-details-body">
              <BaseSegmentedControl
                v-model="activeChartMode"
                :options="[
                  { label: 'War', value: 'war' },
                  { label: 'Voyage', value: 'voyage' }
                ]"
                compact
              />

              <WarHistoryChart
                v-if="activeChartMode === 'war'"
                :history="props.member.d.hist"
                :loading="props.appIsRefreshing"
              />
              <VoyageHistoryChart
                v-else
                :history="props.member.d.v_hist"
                :loading="props.appIsRefreshing"
              />
            </div>
          </div>
        </Transition>
      </section>

      <CardActions
        :id="props.member.id"
        class="card-actions-margin"
        :loading="props.appIsRefreshing"
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

.lifetime-grid-margin {
  margin-top: var(--sys-space-16);
}

.history-section {
  display: grid;
  margin-top: var(--sys-space-16);
}

.history-heading {
  display: grid;
  gap: var(--sys-space-2);
  min-width: 0;
  text-align: left;
  color: var(--sys-color-on-surface-variant);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-sm);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
  text-transform: uppercase;
}

.history-heading-label {
  width: fit-content;
}

.history-heading-detail {
  color: var(--sys-color-outline);
  font-size: var(--sys-typescale-label-xs);
  font-weight: 600;
  letter-spacing: normal;
  text-transform: none;
}

.history-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sys-space-12);
  width: 100%;
  min-height: var(--sys-space-48);
  padding: var(--sys-space-4) var(--sys-space-8);
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: var(--sys-shape-corner-small);
  cursor: pointer;
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.history-trigger:hover,
.history-trigger:focus-visible {
  color: var(--sys-color-primary);
  background: var(--sys-color-surface-container-highest);
  outline: none;
}

.history-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--sys-color-primary);
}

.history-action {
  display: inline-flex;
  align-items: center;
  gap: var(--sys-space-4);
  flex: 0 0 auto;
  color: var(--sys-color-primary);
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-label-xs);
  font-weight: 800;
  letter-spacing: var(--sys-tracking-wide);
  line-height: var(--sys-leading-none);
  text-transform: uppercase;
}

.history-chevron {
  transition: transform var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
}

.history-chevron.is-open {
  transform: rotate(180deg);
}

.history-details-reveal {
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
}

.history-details-body {
  display: grid;
  gap: var(--sys-space-8);
  min-height: 0;
  padding-top: var(--sys-space-8);
}

.history-details-enter-active,
.history-details-leave-active {
  transition:
    grid-template-rows var(--sys-motion-duration-300) var(--sys-motion-easing-standard),
    opacity var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.history-details-enter-active .history-details-body,
.history-details-leave-active .history-details-body {
  transition: padding-top var(--sys-motion-duration-300) var(--sys-motion-easing-standard);
}

.history-details-enter-from,
.history-details-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.history-details-enter-from .history-details-body,
.history-details-leave-to .history-details-body {
  padding-top: 0;
}

@media (prefers-reduced-motion: reduce) {
  :global(html:not([data-motion-preference="standard"])) .history-trigger,
  :global(html:not([data-motion-preference="standard"])) .history-chevron,
  :global(html:not([data-motion-preference="standard"])) .history-details-enter-active,
  :global(html:not([data-motion-preference="standard"])) .history-details-leave-active,
  :global(html:not([data-motion-preference="standard"])) .history-details-enter-active .history-details-body,
  :global(html:not([data-motion-preference="standard"])) .history-details-leave-active .history-details-body {
    transition: none;
  }
}

:global(html[data-motion-preference="reduced"]) .history-trigger,
:global(html[data-motion-preference="reduced"]) .history-chevron,
:global(html[data-motion-preference="reduced"]) .history-details-enter-active,
:global(html[data-motion-preference="reduced"]) .history-details-leave-active,
:global(html[data-motion-preference="reduced"]) .history-details-enter-active .history-details-body,
:global(html[data-motion-preference="reduced"]) .history-details-leave-active .history-details-body { transition: none; }

.card-actions-margin {
  margin-top: var(--sys-space-16);
}
</style>
