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
 * **Decision Log - Touch targets, Brokered Haptics & Selection Containment:**
 * - Uses the centralized `v-tactile` directive to brokered tactile feedback
 *   upon direct user-initiated refresh actions.
 * - Action buttons enforce the 48px mobile touch footprint standard (`height: 48px`).
 * - Applies `user-select: none` text selection containment (Target A.3) to row
   labels and descriptions to prevent accidental drag selection overlays in WebView.
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
      <div
        v-for="target in targets"
        :key="target.key"
        class="refresh-row"
      >
        <div class="row-info">
          <!-- [DECISION LOG] SKELETON REHYDRATION: Pre-render layout line grids
               to mimic real text width and maintain Visual Hydration Parity. -->
          <template v-if="isRefreshing">
            <div
              class="sk-text-line-m"
              style="width: 100px"
            />
            <div
              class="sk-text-line-s"
              style="width: 150px"
            />
          </template>
          <template v-else>
            <div class="row-label">
              {{ target.label }}
            </div>
            <div class="row-desc">
              {{ target.desc }}
            </div>
          </template>
        </div>

        <button
          v-tactile
          class="action-btn"
          :disabled="target.status === 'loading' || target.cooldown > 0"
          :class="{
            'is-loading': target.status === 'loading',
            'skeleton-anim sk-button-m': isRefreshing,
          }"
          @click="refresh(target.key)"
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
            <div class="spinner" />
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
  user-select: none; /* Text Selection Containment (Target A.3) */
  -webkit-user-select: none;
}
.refresh-row:last-child {
  border-bottom: none;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* Row typescale aligned to the SettingRow/LinkRow scale (body-rg over body-sm); these
   were previously hardcoded one step smaller at 14px/12px. */
.row-label {
  font-weight: 800;
  font-size: var(--sys-typescale-body-rg);
  color: var(--sys-color-on-surface);
}
.row-desc {
  font-size: var(--sys-typescale-body-sm);
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

.cooldown-text {
  font-variant-numeric: tabular-nums;
}
</style>
