<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
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

const selectedCount = computed(() => fabState.selectionCount ?? 0);
const dismissLabel = computed(() => fabState.dismissLabel || "Clear selection");
const dismissAriaLabel = computed(() => {
  if (selectedCount.value === 0) return dismissLabel.value;
  return `${dismissLabel.value} (${selectedCount.value})`;
});
const blitzAriaLabel = computed(() => {
  if (selectedCount.value === 0) return "Select one or more entries to start Blitz";
  return `Start Blitz for ${selectedCount.value} selected`;
});

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
  <div class="selection-fab">
    <!-- Dismiss Button (Always Visible) -->
    <!-- [DECISION LOG] THE NAME CONTAINS THE WORD ON THE BUTTON:
       In its resting state this button renders the word "Clear" and was named
       "Dismiss Selection", sharing no word with it. Voice control matches on the
       accessible name, so "click Clear" could not activate the control a person
       was looking at (WCAG 2.5.3, Label in Name). The other two states render no
       text, so their names are free to describe the action instead. -->
    <button
      v-tactile
      class="fab-btn dismiss"
      :class="{
        compact: fabState.isBlasting || (fabState.selectionCount ?? 0) > 0 || fabState.isHarvesting,
        danger: fabState.isHarvesting || fabState.isBlasting,
      }"
      :aria-label="fabState.isHarvesting ? 'Abort Harvest' : fabState.isBlasting ? 'Cancel Blitz' : dismissAriaLabel"
      :title="fabState.isHarvesting ? 'Abort Harvest' : fabState.isBlasting ? 'Cancel Blitz' : dismissAriaLabel"
      @click="fabState.isHarvesting ? handleFabAbortHarvest() : handleFabDismiss()"
    >
      <Icon
        :name="fabState.dismissIcon || 'close'"
        size="18"
      />
      <span v-if="!fabState.selectionCount && !fabState.isBlasting && !fabState.isHarvesting">Clear</span>
    </button>

    <!-- Blasting State: Progress Indicator -->
    <template v-if="fabState.isBlasting">
      <div
        class="blast-status"
        role="status"
        aria-live="polite"
        :aria-label="`Blitz progress: ${fabState.label}`"
      >
        <div class="spinner-small" />
        <span class="blast-label">{{ fabState.label }}</span>
      </div>

      <button
        v-tactile
        class="fab-btn primary compact"
        aria-label="Open Next Profile"
        @click="handleFabAction"
      >
        <Icon
          name="chevron_right"
          size="20"
        />
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
          :aria-label="blitzAriaLabel"
          :title="blitzAriaLabel"
          @click="handleFabBlitz"
        >
          <Icon
            name="lightning"
            size="18"
          />
          <span>Blitz</span>
          <span
            v-if="selectedCount > 0"
            class="blitz-count"
            aria-hidden="true"
          >{{ selectedCount }}</span>
          <span
            v-if="selectedCount > 0"
            class="blitz-selected"
            aria-hidden="true"
          >selected</span>
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
            aria-label="Global Harvest"
            @click="handleFabGlobalHarvest"
          >
            <div
              v-if="fabState.isHarvesting && fabState.activeHarvester === 'global'"
              class="spinner-small"
            />
            <Icon
              v-else
              name="globe"
              size="18"
            />
          </button>

          <!-- Local Harvest Button (Map-Pin) -->
          <button
            v-tactile
            class="fab-btn compact secondary-harvest"
            :class="{ loading: fabState.isHarvesting && fabState.activeHarvester === 'local' }"
            :disabled="fabState.isHarvesting"
            aria-label="Local Harvest"
            @click="handleFabLocalHarvest"
          >
            <div
              v-if="fabState.isHarvesting && fabState.activeHarvester === 'local'"
              class="spinner-small"
            />
            <Icon
              v-else
              name="map_pin"
              size="18"
            />
          </button>
        </template>
      </template>

      <!-- Action Button (Only if Blitz is NOT enabled) -->
      <button
        v-else
        v-tactile
        class="fab-btn primary"
        :aria-label="fabState.label || 'Open'"
        @click="handleFabAction"
      >
        <Icon
          name="check"
          size="18"
        />
        <span :key="fabState.label">{{ fabState.label }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.fab-btn {
  height: 56px;
  padding: 0 var(--sys-space-24);
  min-height: 56px;
  border-radius: var(--sys-shape-corner-full);
  font-weight: 900;
  font-size: 15px;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-10);
  cursor: pointer;
  border: none;
  transition:
    transform var(--sys-motion-duration-200) cubic-bezier(0.2, 0, 0, 1),
    background var(--sys-motion-duration-200);
  color: var(--sys-color-on-surface);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.selection-fab {
  display: flex;
  align-items: center;
  gap: var(--sys-space-6);
  min-width: 0;
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
.fab-btn.dismiss {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface-variant);
  border: 1px solid var(--sys-color-outline-variant);
}

.fab-btn.dismiss.danger {
  background: var(--sys-color-error-container);
  color: var(--sys-color-on-error-container);
  border-color: transparent;
}

/* [DECISION LOG] BLITZ GETS A ROLE, NOT A PALETTE OF ITS OWN:
   Every other action in this dock names a semantic role - .primary is
   primary/on-primary, .danger is error-container/on-error-container - and this
   one carried a dark purple gradient with pale pink ink that appears nowhere
   else in the app. Being outside the token set, it did not follow the theme:
   in light mode a near-black purple slab with #f2daff text sat on the dock's
   pale glass, which is the one place a stray palette is most obvious.

   secondary-container is the role that means "a distinct action, not the
   primary one", which is exactly what Blitz is beside Harvest. It stays
   visually separate from .primary in both themes without inventing a colour. */
.fab-btn.blitz {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: var(--sys-elevation-2);
}

.blitz-count {
  font-family: var(--sys-font-family-mono);
  font-size: 0.9em;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.blast-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-2);
  min-width: 90px;
}
.blast-label {
  font-family: var(--sys-font-family-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--sys-color-on-surface);
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin var(--sys-motion-ambient-spin) linear infinite;
  opacity: 0.6;
}

/* The three fallbacks here were from the same off-token purple set and could
   never be reached, since every --sys-color-* is declared on :root. */
.fab-btn.secondary-harvest {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-on-surface);
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: var(--sys-elevation-2);
}
.fab-btn.secondary-harvest:active {
  background: var(--sys-overlay-light-subtle);
}
.fab-btn.secondary-harvest:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .fab-btn:not(.compact) {
    padding: 0 var(--sys-space-16);
    gap: var(--sys-space-8);
    font-size: 14px;
  }

  /* The compact rail keeps the actionable count but yields the explanatory
     word before its four selection actions compete for horizontal space. */
  .blitz-selected {
    display: none;
  }
}

@media (max-width: 360px) {
  /* At 320px a zero-selection Headhunter dock can contain Clear, Blitz, and
     two harvest actions. Preserve all actions and their 48px targets, but let
     the prominent Blitz action absorb the remaining rail width instead of
     pushing the dock past its safe viewport. */
  .selection-fab {
    width: 100%;
    max-width: 100%;
    gap: var(--sys-space-4);
  }

  .fab-btn {
    height: var(--sys-space-48);
    min-height: var(--sys-space-48);
  }

  .fab-btn.compact,
  .fab-btn.dismiss {
    width: var(--sys-space-48);
    min-width: var(--sys-space-48);
    padding: 0;
  }

  /* The close glyph and its accessible name remain; only the redundant visual
     word steps aside until the viewport has room to show it comfortably. */
  .fab-btn.dismiss > span { display: none; }

  .fab-btn.blitz {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 var(--sys-space-12);
    gap: var(--sys-space-6);
  }
}

</style>
