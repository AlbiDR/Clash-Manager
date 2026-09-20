<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [FEATURE] VOYAGE BANNER COMPONENT
 * ----------------------------------------------------------------------------
 * A high-visibility, glassmorphism-styled progress banner displayed in the
 * Roster header when a Clan Voyage event is ACTIVE, PENDING, or AWAITING promotion.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Component (@features)
 * - **Role:** Live feedback surface for the active or upcoming Voyage event.
 * ============================================================================
 */
import { onMounted, computed } from "vue";
import { useVoyageStatus } from "../composables/useVoyageStatus";
import Icon from "./Icon.vue";
import AnimatedDigits from "./AnimatedDigits.vue";
import { formatNumber } from "@core";

const { store, timeRemaining, startsInCountdown, progressPercent } = useVoyageStatus();

onMounted(() => {
  store.refresh();
});

const shouldShowBanner = computed(() => {
  return store.isActive || store.isPending || store.isAwaitingEnd;
});
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="shouldShowBanner"
      class="voyage-banner"
      :class="{
        'is-victory': store.isVictory,
        'is-pre-event': store.isPending || store.isAwaitingEnd
      }"
      role="status"
      aria-label="Clan Voyage Status"
    >
      <!-- Header Row -->
      <div
        class="banner-header"
        :class="{ 'no-margin': store.isPending || store.isAwaitingEnd }"
      >
        <div class="banner-title-group">
          <span class="banner-icon">
            <Icon
              v-if="store.isVictory"
              name="victory"
              size="20"
            />
            <Icon
              v-else-if="store.isPending"
              name="schedule"
              size="20"
            />
            <Icon
              v-else-if="store.isAwaitingEnd"
              name="warning"
              size="20"
            />
            <Icon
              v-else
              name="voyage"
              size="20"
            />
          </span>
          <div class="banner-labels">
            <span class="banner-title">Clan Voyage</span>
            <span
              v-if="store.isVictory"
              class="victory-label label-badge"
            >Goal Achieved</span>
            <span
              v-else-if="store.isPending"
              class="pre-event-label label-badge"
            >Pre-Event Scheduled</span>
            <span
              v-else-if="store.isAwaitingEnd"
              class="awaiting-label label-badge"
            >Awaiting Promotion</span>
            <span
              v-else
              class="banner-subtitle label-section"
            >Active Event</span>
          </div>
        </div>
        <div class="banner-meta">
          <div class="crown-count">
            <AnimatedDigits
              class="crown-value"
              :value="formatNumber(store.totalCrowns)"
              label="Crowns earned"
            />
            <span
              v-if="store.isActive"
              class="crown-sep"
            >/</span>
            <AnimatedDigits
              v-if="store.isActive"
              class="crown-target"
              :value="formatNumber(store.targetCrowns)"
              label="Crown target"
            />
            <AnimatedDigits
              v-else
              class="crown-target-single"
              :value="`Target: ${formatNumber(store.targetCrowns)}`"
              label="Crown target"
            />
            <span class="crown-icon"><Icon
              name="crown"
              size="14"
            /></span>
          </div>
          <div
            v-if="store.isActive"
            class="countdown"
            :class="{ 'ended': timeRemaining === 'Ended' }"
          >
            <AnimatedDigits
              :value="timeRemaining"
              direction="down"
              label="Time remaining"
            />
          </div>
          <div
            v-else-if="store.isPending"
            class="countdown pending"
            :class="{ 'ended': startsInCountdown === 'Ended' }"
          >
            <span>Starts in: </span><AnimatedDigits
              :value="startsInCountdown"
              direction="down"
              label="Time until Clan Voyage starts"
            />
          </div>
          <div
            v-else-if="store.isAwaitingEnd"
            class="countdown awaiting"
          >
            Set End Time
          </div>
        </div>
      </div>

      <!-- Progress Bar (Only for active events) -->
      <div
        v-if="store.isActive"
        class="progress-track"
        aria-hidden="true"
      >
        <div
          class="progress-fill"
          :style="{ width: `${progressPercent}%` }"
          :class="{ 'is-victory': store.isVictory }"
        />
        <span class="progress-label">{{ progressPercent }}%</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* --- Base Banner --- */
.voyage-banner {
  margin: 0 var(--sys-space-16) var(--sys-space-8);
  padding: var(--sys-space-12) var(--sys-space-16);
  border-radius: var(--sys-shape-corner-m);
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 4px 24px rgba(var(--sys-color-primary-rgb), 0.12),
    inset 0 1px 0 var(--sys-overlay-light-soft);
  overflow: hidden;
  position: relative;
}

/* --- Pre-event Banner Styles --- */
.voyage-banner.is-pre-event {
  background: rgba(245, 158, 11, 0.07);
  border-color: rgba(245, 158, 11, 0.25);
  box-shadow: 0 4px 24px rgba(245, 158, 11, 0.1), inset 0 1px 0 var(--sys-overlay-light-subtle);
  animation: pre-event-pulse var(--sys-motion-ambient-pulse) ease-in-out infinite;
}

@keyframes pre-event-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(0.99); }
}

/* --- Victory State --- */
.voyage-banner.is-victory {
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.15),
    rgba(16, 185, 129, 0.1)
  );
  border-color: rgba(251, 191, 36, 0.4);
  box-shadow:
    0 4px 32px rgba(251, 191, 36, 0.2),
    inset 0 1px 0 var(--sys-overlay-light-soft);
  animation: victory-pulse var(--sys-motion-ambient-pulse) ease-in-out infinite;
}

@keyframes victory-pulse {
  0%, 100% { box-shadow: 0 4px 32px rgba(251, 191, 36, 0.2), inset 0 1px 0 var(--sys-overlay-light-soft); }
  50%       { box-shadow: 0 4px 48px rgba(251, 191, 36, 0.4), inset 0 1px 0 var(--sys-overlay-light-medium); }
}

/* --- Header Row --- */
.banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sys-space-20);
  gap: var(--sys-space-8);
}

.banner-header.no-margin {
  margin-bottom: 0;
}

.banner-title-group {
  display: flex;
  align-items: center;
  gap: var(--sys-space-10);
}

.banner-icon {
  font-size: var(--sys-typescale-title-md);
  line-height: 1;
  display: flex;
  align-items: center;
  filter: drop-shadow(0 0 6px rgba(var(--sys-color-primary-rgb), 0.6));
}

.is-victory .banner-icon {
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
  animation: icon-spin var(--sys-motion-duration-400) ease;
}

.is-pre-event .banner-icon {
  filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.6));
}

@keyframes icon-spin {
  from { transform: rotate(-20deg) scale(0.8); }
  to   { transform: rotate(0deg) scale(1); }
}

.banner-labels {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-1);
}

.banner-title {
  font-size: 13px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: 0.01em;
}

.banner-subtitle {
  color: var(--sys-color-primary);
}

.victory-label {
  color: var(--sys-color-voyage-victory);
}

.pre-event-label {
  color: var(--sys-color-voyage-pending);
}

.awaiting-label {
  color: var(--sys-color-voyage-awaiting);
}

/* --- Meta (Crowns + Countdown) --- */
.banner-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sys-space-4);
}

.crown-count {
  display: flex;
  align-items: baseline;
  gap: var(--sys-space-4);
}

.crown-value {
  font-size: 16px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
}

.is-victory .crown-value {
  color: var(--sys-color-voyage-victory);
}

.is-pre-event .crown-value {
  color: var(--sys-color-voyage-pending);
}

.crown-sep {
  font-size: 12px;
  opacity: 0.3;
  font-weight: 700;
}

.crown-target {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  opacity: 0.5;
}

.crown-target-single {
  font-size: 12px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-voyage-pending);
}

.crown-icon {
  font-size: 12px;
  opacity: 0.6;
  margin-left: var(--sys-space-2);
}

.countdown {
  font-size: 10px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-outline);
  letter-spacing: 0.04em;
}

.countdown.ended {
  color: var(--sys-color-error);
}

.countdown.pending {
  color: var(--sys-color-voyage-pending);
}

.countdown.awaiting {
  color: var(--sys-color-voyage-awaiting);
  font-weight: 900;
  animation: pulse-pill var(--sys-motion-ambient-pulse) infinite;
}

@keyframes pulse-pill {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}

/* --- Progress Bar --- */
.progress-track {
  position: relative;
  height: 8px;
  background: rgba(var(--sys-color-primary-rgb), 0.1);
  border-radius: var(--sys-shape-corner-full);
  overflow: visible;
}

.progress-fill {
  height: 100%;
  border-radius: var(--sys-shape-corner-full);
  background: linear-gradient(
    90deg,
    var(--sys-color-primary),
    rgba(var(--sys-color-primary-rgb), 0.7)
  );
  transition: width var(--sys-motion-duration-800) cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}

.progress-fill::after {
  content: "";
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--sys-color-primary);
  box-shadow: 0 0 10px rgba(var(--sys-color-primary-rgb), 0.7);
}

.progress-fill.is-victory {
  background: linear-gradient(90deg, var(--sys-color-voyage-victory), var(--sys-color-success));
}

.progress-fill.is-victory::after {
  background: var(--sys-color-voyage-victory);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
}

.progress-label {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
  opacity: 0.7;
}

/* --- Entry Transition --- */
.banner-slide-enter-active {
  transition: all var(--sys-motion-duration-400) cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: all var(--sys-motion-duration-250) ease-in;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}
</style>
