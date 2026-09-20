<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { computed, useId, useSlots } from "vue";
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
 *
 * [DECISION LOG] A REAL BUTTON, NOT A CLICKABLE DIV:
 * This is the app's primary preference control - Appearance, Notifications,
 * Features, Mode, Backend Refresh and the Laboratory ParameterCard all toggle
 * through it - and its root was a bare `<div>` carrying a click handler: no
 * role, no tabindex, no key handling, and no `aria-checked` under a rendered
 * on/off switch. Nothing here could be reached, operated or read without a
 * pointer. A native `<button>` supplies focusability, the tab order, and Enter
 * and Space activation without a line of key handling, which is the same
 * reasoning `LinkRow.vue` already followed. `role="switch"` plus `aria-checked`
 * then reports the state a screen reader would otherwise have to infer from a
 * decorative div.
 *
 * [DECISION LOG] NAME AND DESCRIPTION ARE WIRED SEPARATELY:
 * Letting the button take its accessible name from its own content would fold
 * the description into the name, so every toggle would announce as a sentence.
 * `useId` gives the two regions stable ids, and the switch points at the label
 * for its name and the description for its detail.
 */

const props = defineProps<{
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

const slots = useSlots();
const labelId = useId();
const descriptionId = useId();

/** Whether a description is actually rendered, so an empty region is never referenced. */
const hasDescription = computed(() => Boolean(props.description || slots.description));
</script>

<template>
  <button
    v-tactile
    type="button"
    role="switch"
    class="setting-row"
    :class="{
      'active-row': active,
      'mini': mini,
      'disabled': disabled
    }"
    :disabled="disabled"
    :aria-checked="active ? 'true' : 'false'"
    :aria-labelledby="labelId"
    :aria-describedby="hasDescription ? descriptionId : undefined"
    @click="$emit('click')"
  >
    <div class="row-info">
      <div
        :id="labelId"
        class="row-label"
      >
        <slot name="label">
          {{ label }}
        </slot>
      </div>
      <div
        :id="descriptionId"
        class="row-desc"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>
    <!-- Decorative: the switch state is carried by aria-checked on the root. -->
    <div
      class="switch"
      :class="{
        active: active,
        'is-loading': loading,
        'skeleton-anim sk-badge-s': loading,
      }"
      aria-hidden="true"
    >
      <div class="handle" />
    </div>
  </button>
</template>

<style scoped>
.setting-row {
  /* Reset the user-agent button so the row renders exactly as the div it
     replaced; everything it gains is behavioural, not visual. */
  width: 100%;
  margin: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;

  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-radius: var(--sys-shape-corner-small);
  transition:
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    color var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
  min-height: var(--sys-space-48); /* 48px Mobile Footprint (Target B.2) */
  padding: var(--sys-space-4) 0; /* Compensating vertical padding */
}

.setting-row:focus-visible {
  outline: 2px solid var(--sys-color-primary);
  outline-offset: var(--sys-space-2);
  border-radius: var(--sys-shape-corner-extra-small);
}

/* Hover is a pointer enhancement only. Touch devices keep their state stable
   until the deliberate press response below. */
@media (hover: hover) {
  .setting-row:not(:disabled):hover .switch {
    border-color: rgba(var(--sys-color-primary-rgb), 0.55);
    box-shadow: 0 2px 8px rgba(var(--sys-color-primary-rgb), 0.16);
  }

  .setting-row:not(:disabled):hover .switch.active {
    box-shadow: 0 3px 10px rgba(var(--sys-color-primary-rgb), 0.28);
  }
}

/* The native `disabled` attribute already blocks activation and removes the
   control from the tab order, so this rule only has to say so visually. */
.setting-row.disabled {
  cursor: default;
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

/* Switch Styles
   The four measurements are declared once here and every other rule derives
   from them, so the handle's travel cannot fall out of step with the track it
   runs in. */
.switch {
  --switch-width: 44px;
  --switch-height: 24px;
  --switch-border: 1.5px;
  --handle-size: 17px;
  --handle-inset: 2px;
  --handle-translate: 0px;
  --handle-press-scale: 1;

  width: var(--switch-width);
  height: var(--switch-height);
  background: var(--sys-color-surface-container-highest);
  border-radius: var(--sys-shape-corner-full);
  position: relative;
  /* `var(--sys-overlay-dark-soft)` was invisible against a dark track. */
  border: var(--switch-border) solid var(--sys-color-outline-variant);
  flex-shrink: 0;
  box-shadow: inset 0 1px 1px var(--sys-overlay-dark-subtle);
  transition:
    background-color var(--sys-motion-duration-300) var(--sys-motion-easing-standard),
    border-color var(--sys-motion-duration-300) var(--sys-motion-easing-standard),
    box-shadow var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
}

.switch.active {
  background: var(--sys-color-primary);
  border-color: var(--sys-color-primary);
  box-shadow:
    inset 0 1px 1px var(--sys-overlay-light-medium),
    0 2px 8px rgba(var(--sys-color-primary-rgb), 0.2);
}

.switch .handle {
  position: absolute;
  top: var(--handle-inset);
  left: var(--handle-inset);
  width: var(--handle-size);
  height: var(--handle-size);
  /* Reads against both tracks in both themes: outline over the resting
     surface, on-primary over the active fill. A bare `white` handle was
     1.2:1 against the light-blue dark-mode track. */
  background: var(--sys-color-outline);
  border-radius: 50%;
  box-shadow:
    0 1px 2px var(--sys-overlay-dark-soft),
    inset 0 1px 1px var(--sys-overlay-light-medium);
  transition:
    transform var(--sys-motion-duration-300) var(--sys-motion-easing-spring-overshoot),
    background-color var(--sys-motion-duration-200) var(--sys-motion-easing-standard),
    box-shadow var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
  transform: translateX(var(--handle-translate)) scaleX(var(--handle-press-scale));
}

/* [DECISION LOG] TRANSFORM, NOT `left`:
   This animated `left`, which BaseCard.vue:25-27 states as the project's
   position against animating layout geometry - every flip ran an uncomposited
   layout pass. The travel is the track's inner width less the handle and both
   insets, derived rather than measured so it survives a resize of any of them. */
.switch.active .handle {
  --handle-translate: calc(
    var(--switch-width) - 2 * var(--switch-border) - var(--handle-size) - 2 *
      var(--handle-inset)
  );
  background: var(--sys-color-on-primary);
}

/* A short horizontal widening gives press feedback without moving the row or
   requiring drag semantics from a full-row preference button. */
.setting-row:not(:disabled):active .switch .handle {
  --handle-press-scale: 1.16;
}

.setting-row:focus-visible .switch {
  box-shadow:
    0 0 0 2px var(--sys-color-primary-container),
    0 0 0 4px var(--sys-color-primary);
}

.switch.is-loading .handle {
  opacity: 0.72;
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

@media (prefers-reduced-motion: reduce) {
  .setting-row,
  .switch,
  .switch .handle {
    transition: none;
  }
}
</style>
