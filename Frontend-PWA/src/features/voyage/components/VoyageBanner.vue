<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [FEATURE] VOYAGE BANNER COMPONENT
 * ----------------------------------------------------------------------------
 * A high-visibility, glassmorphism-styled progress banner displayed in the
 * Roster header when a Clan Voyage event is ACTIVE.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Component (@features)
 * - **Role:** Live feedback surface for the active Voyage event.
 * - **Visibility:** Only rendered when `isActive` is true.
 *
 * **States:**
 * - `ACTIVE (underway)`: Blue glassmorphism with animated progress bar.
 * - `ACTIVE (victory)`: Gold/emerald vibrant gradient with pulse animation.
 * ============================================================================
 */
import { ref, onMounted, onUnmounted, computed, watch } from "vue";
import { useVoyageStore } from "../composables/useVoyageStore";
import { Icon } from "@shared";
import { formatCountdown } from "@core/utils/formatters";

const store = useVoyageStore();

// --- LIVE COUNTDOWN TIMER ---
const timeRemaining = ref("");

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  store.refresh();
  timer = setInterval(() => {
    if (store.endsAt) {
      const wasEnded = timeRemaining.value === "Ended";
      timeRemaining.value = formatCountdown(store.endsAt);
      if (!wasEnded && timeRemaining.value === "Ended") {
        store.refresh();
      }
    }
  }, 1000);
  if (store.endsAt) timeRemaining.value = formatCountdown(store.endsAt);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

// React immediately to store state changes (e.g. activation)
watch(() => store.endsAt, (newVal) => {
  if (newVal) {
    timeRemaining.value = formatCountdown(newVal);
  } else {
    timeRemaining.value = "";
  }
}, { immediate: true });

const progressPercent = computed(() =>
  Math.round(store.progressRatio * 100)
);

const progressLabel = computed(() =>
  `${store.totalCrowns.toLocaleString()} / ${store.targetCrowns.toLocaleString()}`
);
</script>

<template>
  <Transition name="banner-slide">
    <div
      v-if="store.isActive"
      class="voyage-banner"
      :class="{ 'is-victory': store.isVictory }"
      role="status"
      aria-label="Clan Voyage Progress"
    >
      <!-- Header Row -->
      <div class="banner-header">
        <div class="banner-title-group">
          <span class="banner-icon">
            <svg v-if="store.isVictory" viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="1em" height="1em"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>
          </span>
          <div class="banner-labels">
            <span class="banner-title">Clan Voyage</span>
            <span v-if="store.isVictory" class="victory-label">Goal Achieved</span>
            <span v-else class="banner-subtitle">Active Event</span>
          </div>
        </div>
        <div class="banner-meta">
          <div class="crown-count">
            <span class="crown-value">{{ store.totalCrowns.toLocaleString() }}</span>
            <span class="crown-sep">/</span>
            <span class="crown-target">{{ store.targetCrowns.toLocaleString() }}</span>
            <span class="crown-icon"><Icon name="crown" size="14" /></span>
          </div>
          <div class="countdown" :class="{ 'ended': timeRemaining === 'Ended' }">
            {{ timeRemaining }}
          </div>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="progress-track" aria-hidden="true">
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
  margin: 0 16px 8px;
  padding: 12px 16px;
  border-radius: 20px;
  background: rgba(var(--sys-color-primary-rgb), 0.08);
  border: 1px solid rgba(var(--sys-color-primary-rgb), 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow:
    0 4px 24px rgba(var(--sys-color-primary-rgb), 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  overflow: hidden;
  position: relative;
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
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  animation: victory-pulse 2s ease-in-out infinite;
}

@keyframes victory-pulse {
  0%, 100% { box-shadow: 0 4px 32px rgba(251, 191, 36, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12); }
  50%       { box-shadow: 0 4px 48px rgba(251, 191, 36, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.16); }
}

/* --- Header Row --- */
.banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 8px;
}

.banner-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.banner-icon {
  font-size: 20px;
  line-height: 1;
  display: flex;
  align-items: center;
  filter: drop-shadow(0 0 6px rgba(var(--sys-color-primary-rgb), 0.6));
}

.is-victory .banner-icon {
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.8));
  animation: icon-spin 0.4s ease;
}

@keyframes icon-spin {
  from { transform: rotate(-20deg) scale(0.8); }
  to   { transform: rotate(0deg) scale(1); }
}

.banner-labels {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.banner-title {
  font-size: 13px;
  font-weight: 900;
  color: var(--sys-color-on-surface);
  letter-spacing: 0.01em;
}

.banner-subtitle {
  font-size: 10px;
  font-weight: 700;
  color: var(--sys-color-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
}

.victory-label {
  font-size: 10px;
  font-weight: 900;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* --- Meta (Crowns + Countdown) --- */
.banner-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.crown-count {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.crown-value {
  font-size: 16px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
}

.is-victory .crown-value {
  color: #fbbf24;
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

.crown-icon {
  font-size: 12px;
  opacity: 0.6;
  margin-left: 2px;
}

.countdown {
  font-size: 10px;
  font-weight: 800;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-outline);
  letter-spacing: 0.04em;
}

.countdown.ended {
  color: var(--sys-color-error);
}

/* --- Progress Bar --- */
.progress-track {
  position: relative;
  height: 8px;
  background: rgba(var(--sys-color-primary-rgb), 0.1);
  border-radius: 99px;
  overflow: visible;
}

.progress-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(
    90deg,
    var(--sys-color-primary),
    rgba(var(--sys-color-primary-rgb), 0.7)
  );
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
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
  background: linear-gradient(90deg, #fbbf24, #10b981);
}

.progress-fill.is-victory::after {
  background: #fbbf24;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.8);
}

.progress-label {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 10px;
  font-weight: 900;
  font-family: var(--sys-font-family-mono);
  color: var(--sys-color-primary);
  opacity: 0.7;
}

/* --- Entry Transition --- */
.banner-slide-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.banner-slide-leave-active {
  transition: all 0.25s ease-in;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}
</style>
