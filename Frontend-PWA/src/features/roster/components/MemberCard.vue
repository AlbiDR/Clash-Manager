// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

<script setup lang="ts">
/**
 * [FEATURE] MEMBER CARD
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
 * **Constraints:**
 * - Must reside in Layer 3 (@features) as it is coupled to the LeaderboardMember domain type.
 * - Interaction logic (expansion, selection) is delegated to `BaseCard` and orchestrated
 *   via the `useConsoleController` in the parent view.
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
  formatRole,
} from "@shared";
import { computed, ref } from "vue";
import type { LeaderboardMember, ConsoleCardMetadata } from "@core/types";
import { formatTimeAgo, formatNumber } from "@core";
import { useHaptics } from "@shared/composables/useHaptics";

const activeChart = ref<"war" | "voyage">("war");
const haptics = useHaptics();

/**
 * Switch the active chart view with tactile feedback.
 */
function setChart(mode: "war" | "voyage") {
  if (activeChart.value === mode) return;
  haptics.tap();
  activeChart.value = mode;
}

const props = defineProps<ConsoleCardMetadata & {
  /** Unique player tag identifier. */
  id: string;
  /** Authoritative member data object from the Leaderboard dataset. */
  member: LeaderboardMember;
}>();

const emit = defineEmits<{
  /** Triggers card expansion/collapse when not in selection mode. */
  toggle: [];
  /** Triggers addition/removal from the batch selection queue. */
  "toggle-select": [];
}>();

/**
 * ACCESSIBILITY RESOLVER
 * Constructs a semantic description of the member for screen readers.
 */
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
    <!-- [SLOT] IDENTITY META: Semantic badges for clan tenure and hierarchy role. -->
    <template #identity-meta>
      <TenureBadge :days="props.member.d.days" />
      <RoleBadge :role="props.member.d.role" />
    </template>

    <!-- [SLOT] IDENTITY NAME: Primary player identification and current trophy count. -->
    <template #identity-name>
      <span class="player-name">{{ props.member.n }}</span>
      <TrophyBadge :value="props.member.t" context="lb" />
    </template>

    <!-- [SLOT] SCORE SECTION: PeS (Performance Score) and momentum tracking. -->
    <template #score-section>
      <ScoreBadge
        :score="props.member.performanceScore"
        :dt="props.member.dt"
        :performance-raw-score="props.member.performanceRawScore"
        context="lb"
      />
    </template>

    <!-- [SLOT] EXPANDED CONTENT: Detailed performance metrics, war history, and actions. -->
    <template #expanded-content>
      <StatsGrid
        :columns="2"
        :loading="props.appIsRefreshing"
      >
        <StatisticItem
          label="War Rate"
          :value="props.member.d.rate != null ? props.member.d.rate : '0%'"
          :loading="props.appIsRefreshing"
          benchmark-type="lb"
          benchmark-metric="warRate"
          :benchmark-raw-value="props.member.d.rate ?? 0"
        />
        <StatisticItem
          label="Average Fame"
          :loading="props.appIsRefreshing"
          :value="formatNumber(props.member.d.wfame)"
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
        />
      </StatsGrid>

      <div class="chart-toggle-container">
        <button
          class="toggle-btn hit-target"
          :class="{ active: activeChart === 'war' }"
          @click.stop="setChart('war')"
        >
          War
        </button>
        <button
          class="toggle-btn hit-target"
          :class="{ active: activeChart === 'voyage' }"
          @click.stop="setChart('voyage')"
        >
          Voyage
        </button>
      </div>

      <WarHistoryChart v-if="activeChart === 'war'" :history="props.member.d.hist" :loading="props.appIsRefreshing" />
      <VoyageHistoryChart v-else :history="props.member.d.v_hist" :loading="props.appIsRefreshing" />

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

.chart-toggle-container {
  display: flex;
  margin-top: 16px;
  background: var(--sys-color-surface-container);
  border-radius: 8px;
  padding: 2px;
}

.toggle-btn {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--sys-color-on-surface-variant);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn.active {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/*
 * [UX] TOUCH TARGET COMPLIANCE
 * Ensures the toggle buttons achieve a 48px tap footprint in the hybrid shell
 * without altering the compact visual design of the chart controls.
 */
.toggle-btn.hit-target::after {
  inset: -12px -4px;
}

.card-actions-margin {
  margin-top: 16px;
}
</style>
