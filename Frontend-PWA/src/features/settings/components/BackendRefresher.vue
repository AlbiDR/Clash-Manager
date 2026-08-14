<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->

<script setup lang="ts">
import { SettingsCard, vTactile } from "@shared";
import { useBackendRefresher } from "../composables/useBackendRefresher";

/**
 * COMPONENT: BackendRefresher.vue
 * ----------------------------------------------------------------------------
 * Rationale: User interface control panel for manual backend database updates.
 * Features: Granular Domain Cooldown Tracking, Local/Global Sync Skeletons.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 3 Features (@features/settings)
 * - Satisfaction: Satisfies ADR Section IV: Operational Security and Deep Delegation.
 *
 * **Decision Log - Touch targets & Brokered Haptics:**
 * - Uses the centralized `v-tactile` directive to brokered tactile feedback
 *   upon direct user-initiated refresh actions.
 * - Action buttons enforce the 48px mobile touch footprint standard (`height: 48px`).
 */

defineProps<{
  /** Computed boolean indicating if the SettingsCard should initialize in an expanded state. */
  initiallyExpanded?: boolean;
}>();

const { targets, isRefreshing, refresh } = useBackendRefresher();
</script>

<template>
  <SettingsCard
    title="Backend Refresh"
    icon="refresh"
    :loading="isRefreshing"
    :initially-expanded="initiallyExpanded"
    body-class="no-padding"
  >
    <div class="rows-container">
      <div v-for="target in targets" :key="target.key" class="refresh-row">
        <div class="row-info">
          <!-- [DECISION LOG] SKELETON REHYDRATION: Pre-render layout line grids
               to mimic real text width and maintain Visual Hydration Parity. -->
          <template v-if="isRefreshing">
            <div class="sk-text-line-m" style="width: 100px"></div>
            <div class="sk-text-line-s" style="width: 150px"></div>
          </template>
          <template v-else>
            <div class="row-label">{{ target.label }}</div>
            <div class="row-desc">{{ target.desc }}</div>
          </template>
        </div>

        <button
          v-tactile
          class="action-btn"
          @click="refresh(target.key)"
          :disabled="target.status === 'loading' || target.cooldown > 0"
          :class="{
            'is-loading': target.status === 'loading',
            'skeleton-anim sk-button-m': isRefreshing,
          }"
        >
          <!-- Normal State -->
          <template v-if="isRefreshing">
            <!-- Skeleton button covers button, not text -->
          </template>
          <template
            v-else-if="target.status === 'idle' || target.status === 'error'"
          >
            <span>REFRESH</span>
          </template>

          <!-- Loading State -->
          <template v-else-if="target.status === 'loading'">
            <div class="spinner"></div>
          </template>

          <!-- Cooldown State -->
          <template v-else-if="target.status === 'cooldown'">
            <span class="cooldown-text">{{ target.cooldown }}s</span>
          </template>
        </button>
      </div>
    </div>
  </SettingsCard>
</template>

<style scoped>
.no-padding {
  padding: 0 !important;
}

.refresh-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.refresh-row:last-child {
  border-bottom: none;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-label {
  font-weight: 800;
  font-size: 14px;
  color: var(--sys-color-on-surface);
}
.row-desc {
  font-size: 12px;
  opacity: 0.5;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border: none;
  padding: 0 20px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
  min-width: 80px;
  height: 48px; /* 48px Mobile Footprint (Target B.2) */
  transition: all 0.2s;
  position: relative; /* For skeleton overlay */
}
.action-btn.skeleton-anim.sk-button-m {
  background: none; /* Hide native background for skeleton */
  border: none;
  color: transparent; /* Hide native text for skeleton */
}
.action-btn.skeleton-anim.sk-button-m::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--sk-fill-secondary); /* Skeleton background */
  border-radius: 8px;
  animation: pulse 1.5s infinite ease-in-out;
}

.action-btn:hover:not(:disabled) {
  background: var(--sys-color-primary);
  color: white;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--sys-color-surface-variant);
  color: var(--sys-color-on-surface-variant);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.cooldown-text {
  font-variant-numeric: tabular-nums;
}
</style>
