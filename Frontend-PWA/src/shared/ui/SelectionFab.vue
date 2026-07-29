<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import Icon from "./Icon.vue";
import { useUiCoordinator } from "@core";
import { vTactile } from "../directives/vTactile";

/**
 * COMPONENT: SelectionFab
 *
 * @remarks
 * Orchestrates contextual actions (Selection, Blitz, Harvesting) within a
 * unified floating action button cluster. This component is strictly
 * presentation-oriented, delegating all logic to the `useUiCoordinator`
 * `fabState` contract.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared UI (@shared/ui)
 * - **Role:** Contextual action entry point.
 * - **Satisfaction:** ADR Section II: Structural Unitary Architecture.
 */

const { fabState } = useUiCoordinator();

/**
 * [DECISION LOG] ACTION DELEGATION: All handlers verify the existence of
 * callbacks in `fabState` before execution, ensuring the component remains
 * decoupled from feature-specific logic.
 *
 * [DECISION LOG] COMPACT MODE: The dismiss button collapses into a circle
 * whenever additional actions (Blitz/Harvest/Selection) are active in the
 * template to preserve horizontal space and maintain visual hierarchy.
 *
 * [THREAT:] UI desynchronization if `fabState` is modified without
 * corresponding callback updates. Guarded by null-checks.
 */

function handleFabAction(e: MouseEvent) {
  if (fabState.onAction) fabState.onAction(e);
}

function handleFabBlitz() {
  if (fabState.onBlitz) fabState.onBlitz();
}

function handleFabDismiss() {
  if (fabState.onDismiss) fabState.onDismiss();
}

function handleFabGlobalHarvest() {
  if (fabState.onGlobalHarvest) fabState.onGlobalHarvest();
}

function handleFabLocalHarvest() {
  if (fabState.onLocalHarvest) fabState.onLocalHarvest();
}

function handleFabAbortHarvest() {
  if (fabState.onAbortHarvest) fabState.onAbortHarvest();
}
</script>

<template>
  <!-- Dismiss Button (Always Visible) -->
  <button
    v-tactile
    class="fab-btn danger"
    :class="{ compact: fabState.isBlasting || (fabState.selectionCount ?? 0) > 0 || fabState.isHarvesting }"
    @click="fabState.isHarvesting ? handleFabAbortHarvest() : handleFabDismiss()"
    :aria-label="fabState.isHarvesting ? 'Abort Harvest' : fabState.isBlasting ? 'Cancel Blitz' : 'Dismiss Selection'"
  >
    <Icon :name="fabState.dismissIcon || 'close'" size="18" />
    <span v-if="!fabState.selectionCount && !fabState.isBlasting && !fabState.isHarvesting"
      >Clear</span
    >
  </button>

  <!-- Blasting State: Progress Indicator -->
  <template v-if="fabState.isBlasting">
    <div class="blast-status">
      <div class="spinner-small"></div>
      <span class="blast-label">{{ fabState.label }}</span>
    </div>

    <button
      v-tactile
      class="fab-btn primary compact"
      @click="handleFabAction"
      aria-label="Open Next Profile"
    >
      <Icon name="chevron_right" size="20" />
    </button>
  </template>

  <!-- Normal Selection State -->
  <template v-else>
    <!-- Harvest & Blitz Button Group (If Blitz is enabled) -->
    <template v-if="fabState.blitzEnabled">
      <!-- Main Blitz Button -->
      <button
        v-tactile
        class="fab-btn blitz"
        :disabled="fabState.isHarvesting || (fabState.selectionCount ?? 0) === 0"
        @click="handleFabBlitz"
        aria-label="Start Blitz Mode"
      >
        <Icon name="lightning" size="18" />
        <span>Blitz</span>
      </button>

      <!-- Harvest scouts external clanless players from the leaderboard for
           recruiting, which only applies to views wired up for it
           (Headhunter). Gated separately from blitzEnabled so views that
           share this FAB (e.g. Roster) don't show a button that silently
           does nothing. -->
      <template v-if="fabState.harvestEnabled">
        <!-- Global Harvest Button (Globe) -->
        <button
          v-tactile
          class="fab-btn compact secondary-harvest"
          :class="{ loading: fabState.isHarvesting && fabState.activeHarvester === 'global' }"
          :disabled="fabState.isHarvesting"
          @click="handleFabGlobalHarvest"
          aria-label="Global Harvest"
        >
          <div v-if="fabState.isHarvesting && fabState.activeHarvester === 'global'" class="spinner-small"></div>
          <Icon v-else name="globe" size="18" />
        </button>

        <!-- Local Harvest Button (Map-Pin) -->
        <button
          v-tactile
          class="fab-btn compact secondary-harvest"
          :class="{ loading: fabState.isHarvesting && fabState.activeHarvester === 'local' }"
          :disabled="fabState.isHarvesting"
          @click="handleFabLocalHarvest"
          aria-label="Local Harvest"
        >
          <div v-if="fabState.isHarvesting && fabState.activeHarvester === 'local'" class="spinner-small"></div>
          <Icon v-else name="map_pin" size="18" />
        </button>
      </template>
    </template>

    <!-- Action Button (Only if Blitz is NOT enabled) -->
    <button
      v-tactile
      v-else
      class="fab-btn primary"
      @click="handleFabAction"
      :aria-label="fabState.label || 'Open'"
    >
      <Icon name="check" size="18" />
      <span :key="fabState.label">{{ fabState.label }}</span>
    </button>
  </template>
</template>

<style scoped>
.fab-btn {
  height: 56px;
  padding: 0 24px;
  min-height: 56px;
  border-radius: var(--sys-shape-corner-full);
  font-weight: 900;
  font-size: 15px;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  border: none;
  transition:
    transform 0.15s cubic-bezier(0.2, 0, 0, 1),
    background 0.2s;
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.fab-btn:active {
  transform: scale(0.93);
  opacity: 0.9;
}

.fab-btn.compact {
  padding: 0;
  width: 56px;
  min-width: 56px;
}

.fab-btn.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: 0 4px 16px rgba(var(--sys-color-primary-rgb), 0.35);
}
.fab-btn.danger {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
}

.fab-btn.blitz {
  background: linear-gradient(135deg, #6b5778, #4a3b55);
  color: #f2daff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 12px rgba(107, 87, 120, 0.4);
}

.blast-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 90px;
}
.blast-label {
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  opacity: 0.6;
}
@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.fab-btn.secondary-harvest {
  background: var(--sys-color-surface-container-highest, #2a2233);
  color: var(--sys-color-on-surface, #f2daff);
  border: 1px solid var(--sys-color-outline-variant, rgba(255, 255, 255, 0.1));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.fab-btn.secondary-harvest:active {
  background: rgba(255, 255, 255, 0.05);
}
.fab-btn.secondary-harvest:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .fab-btn:not(.compact) {
    padding: 0 16px;
    gap: 8px;
    font-size: 14px;
  }
}
</style>
