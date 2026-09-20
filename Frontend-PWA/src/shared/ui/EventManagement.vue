<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [FEATURE] EVENT MANAGEMENT SETTINGS CARD
 * ----------------------------------------------------------------------------
 * The "Mirror Activation Cockpit" - a Settings card for manually activating
 * and monitoring a Clan Voyage event.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Component (@features)
 * - **Role:** Event setup interface within the Settings view.
 *
 * **T2T Input:**
 * - Setup form logic has been delegated to VoyageSetupForm.vue to adhere
 *   to the 400-line SRP threshold (ADR Section III).
 * ============================================================================
 */
import { computed, onMounted, defineAsyncComponent } from "vue";
import { default as SettingsCard } from "./SettingsCard.vue";
import Icon from "./Icon.vue";
import AnimatedDigits from "./AnimatedDigits.vue";
import { useVoyageStatus } from "../composables/useVoyageStatus";
import { formatNumber } from "@core";

const VoyageSetupForm = defineAsyncComponent(() => import("./VoyageSetupForm.vue"));

defineProps<{
  initiallyExpanded?: boolean;
}>();

const { store, timeRemaining, startsInCountdown } = useVoyageStatus({ showDays: true });

onMounted(() => {
  store.refresh();
});

const pillLabel = computed(() => {
  if (store.isPending) return "Pending";
  return store.status;
});

const pillClass = computed(() => {
  if (store.isPending) return "pending";
  return store.status.toLowerCase();
});
</script>

<template>
  <SettingsCard
    title="Event Management"
    icon="flag"
    :initially-expanded="initiallyExpanded || store.isActive || store.isPending"
  >
    <!-- Active Event Status -->
    <template #header-extra>
      <div
        class="status-pill label-badge"
        :class="pillClass"
      >
        {{ pillLabel }}
      </div>
    </template>

    <!-- Pre-Event Summary (read-only) -->
    <div
      v-if="store.isPending"
      class="active-summary pre-event-summary"
    >
      <div class="summary-row">
        <span class="summary-label label-section">Crown Target</span>
        <span class="summary-value primary">
          <AnimatedDigits
            :value="formatNumber(store.targetCrowns)"
            label="Crown target"
          /> <Icon
            name="crown"
            size="14"
            style="display: inline-block; vertical-align: middle; margin-left: var(--sys-space-2);"
          />
        </span>
      </div>
      <div
        v-if="startsInCountdown"
        class="summary-row"
      >
        <span class="summary-label label-section">Starts In</span>
        <span class="summary-value timer pending-timer">
          <AnimatedDigits
            :value="startsInCountdown"
            direction="down"
            label="Time until Clan Voyage starts"
          />
        </span>
      </div>
      <div class="section-divider" />
    </div>

    <!-- Active Event Summary (read-only) -->
    <div
      v-if="store.isActive"
      class="active-summary"
    >
      <div class="summary-row">
        <span class="summary-label label-section">Progress</span>
        <span class="summary-value primary">
          <AnimatedDigits
            :value="formatNumber(store.totalCrowns)"
            label="Crowns earned"
          /> / <AnimatedDigits
            :value="formatNumber(store.targetCrowns)"
            label="Crown target"
          /> <Icon
            name="crown"
            size="14"
            style="display: inline-block; vertical-align: middle; margin-left: var(--sys-space-2);"
          />
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-label label-section">Completion</span>
        <span class="summary-value primary">
          <AnimatedDigits
            :value="`${Math.round(store.progressRatio * 100)}%`"
            label="Voyage completion"
          />
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-label label-section">Status</span>
        <span
          class="summary-value"
          :class="{ 'victory': store.isVictory }"
        >
          {{ store.isVictory ? "Goal Achieved" : "Underway" }}
        </span>
      </div>
      <div
        v-if="timeRemaining"
        class="summary-row"
      >
        <span class="summary-label label-section">Ends In</span>
        <span
          class="summary-value timer"
          :class="{ 'ended': timeRemaining === 'Ended' }"
        >
          <AnimatedDigits
            :value="timeRemaining"
            direction="down"
            label="Time remaining"
          />
        </span>
      </div>
      <!-- Nudge: end_at not yet set -->
      <div
        v-if="!store.endsAt"
        class="summary-row"
      >
        <span class="summary-label label-section">Ends In</span>
        <span class="summary-value awaiting-text">Not yet set</span>
      </div>
      <div class="section-divider" />
    </div>

    <!-- Setup Form (Delegated) -->
    <VoyageSetupForm />
  </SettingsCard>
</template>

<style scoped>
/* --- Active Summary --- */
.active-summary {
  background: rgba(var(--sys-color-primary-rgb), 0.06);
  border-radius: var(--sys-shape-corner-input);
  padding: var(--sys-space-12) var(--sys-space-14);
  margin-bottom: var(--sys-space-16);
}

.pre-event-summary {
  background: rgba(245, 158, 11, 0.06);
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sys-space-4) 0;
}

.summary-value {
  font-size: 13px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
}

.summary-value.primary { color: var(--sys-color-primary); }
.summary-value.victory { color: var(--sys-color-voyage-victory); }
.summary-value.timer { color: var(--sys-color-outline); }
.summary-value.timer.ended { color: var(--sys-color-error); }
.summary-value.pending-timer { color: var(--sys-color-voyage-pending); }
.summary-value.awaiting-text { color: var(--sys-color-voyage-awaiting); }

.section-divider {
  height: 1px;
  background: rgba(var(--sys-color-primary-rgb), 0.1);
  margin-top: var(--sys-space-10);
}

/* --- Status Pill (Header Slot) --- */
.status-pill {
  padding: var(--sys-space-4) var(--sys-space-8);
  border-radius: var(--sys-shape-corner-full);
  border: 1px solid currentColor;
}

.status-pill.idle        { color: var(--sys-color-outline); }
.status-pill.pending     { color: var(--sys-color-voyage-pending); }
.status-pill.active      { color: var(--sys-color-success); animation: pulse-pill var(--sys-motion-ambient-pulse) infinite; }
.status-pill.completed   { color: var(--sys-color-primary); }

@keyframes pulse-pill {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
</style>
