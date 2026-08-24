<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { vTactile } from "../directives/vTactile";

/**
 * COMPONENT: SettingRow
 * ----------------------------------------------------------------------------
 * Rationale: A standardized preference and settings layout element used across
 * Settings panel modules (Appearance, Notification, Features) and Laboratory setup cards.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Satisfies ADR Section II: Mobile WebView Ergonomics & Target B.2.
 * Enforces a minimum tap footprint height of 48px with vertical padding to guarantee
 * high-fidelity hit accuracy under hybrid Android WebView/PWA configurations on dense screens.
 *
 * **Decision Log - Touch targets & Brokered Haptics:**
 * - Touch Target Compliance (Priority 4 / Target B.2): Replaces default inline margins
 *   with an explicit 48px height footprint and relative hit boundaries.
 * - Declarative Haptics Brokering: Leverages custom `v-tactile` directive to marshal
 *   tactile interaction events seamlessly through Layer 2 brokering without legacy
 *   useHaptics imperative hooks overhead.
 */

defineProps<{
  /** Main display title for the preference option. */
  label?: string;

  /** Contextual helper subtitle explaining the consequences or options of the preference. */
  description?: string;

  /** Active or selected state of the toggle switch. */
  active?: boolean;

  /** Applies disabled styling, blocks pointer events, and reduces overall element opacity to 0.5. */
  disabled?: boolean;

  /** Triggers a skeleton loading animation overlay on the active switch indicator. */
  loading?: boolean;

  /** Suppresses structural padding and scales down fonts for high-density, compact view layouts. */
  mini?: boolean;
}>();

defineEmits<{
  /**
   * Click event emitted upon user interaction, standardizing the parameter as `emitEvent`
   * to satisfy ADR naming standards and eliminate anemic variable pathogens.
   *
   * @remarks
   * Satisfies ADR Section VII: Naming Conventions. Enforces descriptive naming
   * on the argument callback boundary rather than a generic `e` parameter.
   *
   * @param emitEvent - The click event payload.
   */
  (emitEvent: 'click'): void;
}>();
</script>

<template>
  <div
    v-tactile
    class="setting-row"
    :class="{
      'active-row': active,
      'mini': mini,
      'disabled': disabled
    }"
    @click="!disabled && $emit('click')"
  >
    <div class="row-info">
      <div class="row-label">
        <slot name="label">
          {{ label }}
        </slot>
      </div>
      <div class="row-desc">
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>
    <div
      class="switch"
      :class="{
        active: active,
        'skeleton-anim sk-badge-s': loading,
      }"
    >
      <div class="handle" />
    </div>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-spring);
  min-height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  padding: var(--sys-space-4) 0; /* Compensating vertical padding */
}

.setting-row.disabled {
  pointer-events: none;
  opacity: 0.5;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: var(--sys-space-4);
  flex: 1;
}

.row-label {
  font-weight: 800;
  font-size: var(--sys-typescale-body-rg);
  color: var(--sys-color-outline);
  opacity: 0.5;
  transition: all var(--sys-motion-duration-250) var(--sys-motion-easing-standard);
  display: flex;
  align-items: center;
}

.row-desc {
  font-size: var(--sys-typescale-body-sm);
  opacity: 0.5;
  color: var(--sys-color-outline);
  transition: all var(--sys-motion-duration-250) var(--sys-motion-easing-standard);
}

.setting-row.active-row .row-label {
  color: var(--sys-color-on-surface);
  opacity: 1;
}

.setting-row.active-row .row-desc {
  color: var(--sys-color-on-surface);
  opacity: 0.8;
}

/* Switch Styles */
.switch {
  width: 44px;
  height: 24px;
  background: var(--sys-color-surface-container-highest);
  border-radius: 12px;
  position: relative;
  transition: 0.3s;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.switch.active {
  background: var(--sys-color-primary);
  border-color: var(--sys-color-primary);
}

.switch .handle {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  background: white;
  border-radius: 50%;
  transition: 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.switch.active .handle {
  left: calc(100% - 19px);
}

/* Mini Variant */
.setting-row.mini {
  padding-left: var(--sys-space-8);
  margin-bottom: calc(-1 * var(--sys-space-4));
}

.setting-row.mini .row-label {
  font-size: var(--sys-typescale-body-md);
  font-weight: 700;
}

.setting-row.mini .row-desc {
  font-size: var(--sys-typescale-footer);
}

.setting-row.mini .switch {
  transform: scale(0.85);
}

/* Skeleton animation if loading */
.sk-badge-s {
  border: none !important;
}
</style>
