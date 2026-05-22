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
import { ref, onMounted, onUnmounted } from "vue";
import { SettingsCard, Icon } from "@shared";
import { useVoyageStore } from "../composables/useVoyageStore";
import VoyageSetupForm from "./VoyageSetupForm.vue";
import { formatCountdown } from "@core/utils/formatters";

const props = defineProps<{
  initiallyExpanded?: boolean;
}>();

const store = useVoyageStore();

// --- LIVE COUNTDOWN TIMER ---
const timeRemaining = ref("");

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  store.refresh();
  timer = setInterval(() => {
    if (store.endsAt) {
      const wasEnded = timeRemaining.value === "Ended";
      timeRemaining.value = formatCountdown(store.endsAt, { showDays: true });
      if (!wasEnded && timeRemaining.value === "Ended") {
        store.refresh();
      }
    } else {
      timeRemaining.value = "";
    }
  }, 1000);
  if (store.endsAt) {
    timeRemaining.value = formatCountdown(store.endsAt, { showDays: true });
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <SettingsCard
    title="Event Management"
    icon="flag"
    :initially-expanded="initiallyExpanded"
  >
    <!-- Active Event Status -->
    <template #header-extra>
      <div
        class="status-pill"
        :class="store.status.toLowerCase()"
      >
        {{ store.status }}
      </div>
    </template>

    <!-- Active Event Summary (read-only) -->
    <div v-if="store.isActive" class="active-summary">
      <div class="summary-row">
        <span class="summary-label">Progress</span>
        <span class="summary-value primary">
          {{ store.totalCrowns.toLocaleString() }} / {{ store.targetCrowns.toLocaleString() }} <Icon name="crown" size="14" style="display: inline-block; vertical-align: middle; margin-left: 2px;" />
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Completion</span>
        <span class="summary-value primary">
          {{ Math.round(store.progressRatio * 100) }}%
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Status</span>
        <span class="summary-value" :class="{ 'victory': store.isVictory }">
          {{ store.isVictory ? "Goal Achieved" : "Underway" }}
        </span>
      </div>
      <div class="summary-row" v-if="timeRemaining">
        <span class="summary-label">Ends In</span>
        <span class="summary-value timer" :class="{ 'ended': timeRemaining === 'Ended' }">
          {{ timeRemaining }}
        </span>
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
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.summary-label {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.45;
}

.summary-value {
  font-size: 13px;
  font-weight: 800;
  font-family: var(--sys-font-family-mono);
}

.summary-value.primary { color: var(--sys-color-primary); }
.summary-value.victory { color: #fbbf24; }
.summary-value.timer { color: var(--sys-color-outline); }
.summary-value.timer.ended { color: var(--sys-color-error); }

.section-divider {
  height: 1px;
  background: rgba(var(--sys-color-primary-rgb), 0.1);
  margin-top: 10px;
}

/* --- Status Pill (Header Slot) --- */
.status-pill {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: 99px;
  border: 1px solid currentColor;
}

.status-pill.idle        { color: var(--sys-color-outline); }
.status-pill.pending     { color: #f59e0b; }
.status-pill.active      { color: #22c55e; animation: pulse-pill 2s infinite; }
.status-pill.completed   { color: var(--sys-color-primary); }

@keyframes pulse-pill {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
</style>
