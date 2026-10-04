<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts">
import { computed } from "vue";
import type { ConsoleFabAction } from "@core";
import Icon from "./Icon.vue";
import { useUiCoordinator } from "@core";
import { vTactile } from "../directives/vTactile";

/**
 * COMPONENT: SelectionFab
 *
 * @remarks
 * Renders feature-owned contextual commands and cancellable activity within a
 * unified floating action button cluster. This component is strictly
 * presentation-oriented and has no knowledge of feature command semantics.
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
const hasActivity = computed(() => Boolean(fabState.activity));

/**
 * [DECISION LOG] ACTION DELEGATION: All handlers verify the existence of
 * callbacks in `fabState` before execution, ensuring the component remains
 * decoupled from feature-specific logic.
 *
 * [DECISION LOG] COMPACT MODE: The dismiss button collapses into a circle
 * whenever a selection or cancellable activity is active, preserving space
 * without encoding any feature-specific action hierarchy.
 *
 * [THREAT:] UI desynchronization if `fabState` is modified without
 * corresponding callback updates. Guarded by null-checks.
 */

function handleFabCommand(action: ConsoleFabAction, event: MouseEvent) {
  if (!action.disabled && fabState.onCommand) fabState.onCommand(action.id, event);
}

function handleFabDismiss() {
  if (fabState.onDismiss) fabState.onDismiss();
}

function handleFabCancelOperation() {
  if (fabState.onCancelOperation) fabState.onCancelOperation();
}

</script>

<template>
  <div
    class="selection-fab"
    role="group"
    :aria-label="fabState.activity ? `${fabState.activity.label} controls` : 'Selection actions'"
  >
    <span
      v-if="fabState.activity && !fabState.activity.exclusive"
      class="activity-announcement"
      role="status"
      aria-live="polite"
    >
      {{ fabState.activity.status }}
    </span>
    <!-- Dismiss Button (Always Visible) -->
    <!-- [DECISION LOG] THE NAME CONTAINS THE WORD ON THE BUTTON:
       In its resting state this button renders the word "Clear" and was named
       "Dismiss Selection", sharing no word with it. Voice control matches on the
       accessible name, so "click Clear" could not activate the control a person
       was looking at (WCAG 2.5.3, Label in Name). The other two states render no
       text, so their names are free to describe the action instead. -->
    <button
      v-tactile
      type="button"
      class="fab-btn dismiss"
      :class="{
        compact: hasActivity || selectedCount > 0,
        danger: hasActivity,
      }"
      :aria-label="fabState.activity?.cancelLabel || dismissAriaLabel"
      :title="fabState.activity?.cancelLabel || dismissAriaLabel"
      @click="hasActivity ? handleFabCancelOperation() : handleFabDismiss()"
    >
      <Icon
        :name="hasActivity ? 'close' : fabState.dismissIcon || 'close'"
        size="18"
      />
      <span v-if="selectedCount === 0 && !hasActivity">Clear</span>
    </button>

    <div
      v-if="fabState.activity?.exclusive"
      class="activity-progress"
      role="status"
      aria-live="polite"
      :aria-label="`${fabState.activity.label} progress: ${fabState.activity.status}`"
    >
      <div class="spinner-small" />
      <span class="activity-label">{{ fabState.activity.status }}</span>
    </div>

    <button
      v-for="action in fabState.actions"
      :key="action.id"
      v-tactile
      type="button"
      class="fab-btn"
      :class="[
        action.tone || 'secondary',
        { compact: action.compact, loading: action.busy },
      ]"
      :disabled="action.disabled || action.busy"
      :aria-busy="action.busy || undefined"
      :aria-label="action.accessibleLabel || action.label"
      :title="action.accessibleLabel || action.label"
      @click="handleFabCommand(action, $event)"
    >
      <div
        v-if="action.busy"
        class="spinner-small"
      />
      <Icon
        v-else
        :name="action.icon"
        :size="action.compact ? '20' : '18'"
      />
      <span v-if="!action.compact">{{ action.label }}</span>
      <span
        v-if="action.badge !== undefined"
        class="action-badge"
        aria-hidden="true"
      >{{ action.badge }}</span>
      <span
        v-if="action.supportingLabel"
        class="action-support"
        aria-hidden="true"
      >{{ action.supportingLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
.fab-btn {
  height: var(--sys-space-56);
  padding: 0 var(--sys-space-24);
  min-height: var(--sys-space-56);
  border-radius: var(--sys-shape-corner-full);
  font-weight: var(--sys-font-weight-heavy);
  font-size: var(--sys-typescale-body-rg);
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-10);
  cursor: pointer;
  border: none;
  transition:
    transform var(--sys-motion-duration-200) var(--sys-motion-easing-decelerate),
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
  transform: scale(var(--sys-interaction-pressed-scale));
  opacity: var(--sys-opacity-pressed);
}

.fab-btn:disabled {
  cursor: not-allowed;
  opacity: var(--sys-opacity-disabled);
  box-shadow: none;
  transform: none;
}

.fab-btn:focus-visible {
  outline: var(--sys-space-2) solid var(--sys-color-primary);
  outline-offset: var(--sys-space-4);
}

.fab-btn.compact {
  padding: 0;
  width: var(--sys-space-56);
  min-width: var(--sys-space-56);
}

.fab-btn.primary {
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary);
  box-shadow: var(--sys-elevation-2);
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

/* Feature commands select a semantic emphasis, never their own palette. This
   keeps every contextual action coherent across light and dark themes. */
.fab-btn.secondary {
  background: var(--sys-color-secondary-container);
  color: var(--sys-color-on-secondary-container);
  border: 1px solid var(--sys-color-outline-variant);
  box-shadow: var(--sys-elevation-2);
}

.action-badge {
  font-family: var(--sys-font-family-mono);
  font-size: 0.9em;
  font-weight: var(--sys-font-weight-heavy);
  font-variant-numeric: tabular-nums;
}

.activity-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sys-space-2);
  min-width: var(--sys-layout-fab-status-min-width);
}
.activity-label {
  font-family: var(--sys-font-family-mono);
  font-size: var(--sys-typescale-body-sm);
  font-weight: var(--sys-font-weight-strong);
  color: var(--sys-color-on-surface);
}

.spinner-small {
  width: var(--sys-space-14);
  height: var(--sys-space-14);
  border: var(--sys-space-2) solid var(--sys-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin var(--sys-motion-ambient-spin) linear infinite;
  opacity: var(--sys-opacity-muted);
}

/* The three fallbacks here were from the same off-token purple set and could
   never be reached, since every --sys-color-* is declared on :root. */
.fab-btn.secondary:active {
  background: var(--sys-overlay-light-subtle);
}

.activity-announcement {
  position: absolute;
  width: var(--sys-space-1);
  height: var(--sys-space-1);
  padding: 0;
  margin: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 600px) {
  .fab-btn:not(.compact) {
    padding: 0 var(--sys-space-16);
    gap: var(--sys-space-8);
    font-size: var(--sys-typescale-body-md);
  }

  /* The compact rail keeps the actionable value but yields its supporting
     word before contextual actions compete for horizontal space. */
  .action-support {
    display: none;
  }
}

@media (max-width: 360px) {
  /* Preserve every action and its minimum target on narrow screens, while the
     labelled secondary action absorbs the remaining safe viewport width. */
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

  .fab-btn.secondary:not(.compact) {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 var(--sys-space-12);
    gap: var(--sys-space-6);
  }
}

</style>
