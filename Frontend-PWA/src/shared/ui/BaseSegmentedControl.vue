<!-- SPDX-License-Identifier: GPL-3.0-only -->
<!-- Copyright (C) 2026 AlbiDR -->
<script setup lang="ts" generic="T extends string | number | boolean">
/**
 * [SHARED] BASE SEGMENTED CONTROL
 * ----------------------------------------------------------------------------
 * Rationale: Standardized toggle/segment selector for switching between
 * mutually exclusive options.
 * Layer: @shared/ui
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * **The `hit-target` class on each segment is load-bearing, not cosmetic.**
 * `vTactile` binds pointer events, which `@click.stop` cannot intercept, so a
 * segment rendered inside a tactile container (e.g. `BaseCard`) would otherwise
 * bubble its pointerdown/pointerup to the container and trigger the container's
 * tap gesture. `.hit-target` is the directive's opt-out contract for actionable
 * children; removing it collapses the host card on every segment change.
 *
 * **Haptics are therefore brokered imperatively, not via `v-tactile`.** The
 * directive's guard inspects `event.target`, so it fires for every `vTactile`
 * instance in the bubble path — a `.hit-target` segment suppresses its own
 * directive just as it suppresses the container's. Opting out of the container
 * and binding the directive locally are mutually exclusive.
 */
import { useHaptics } from "../composables/useHaptics";

const props = defineProps<{
  /** The current active value. */
  modelValue: T;
  /** List of available options. */
  options: { label: string; value: T }[];
  /** Optional compact variant for smaller contexts (e.g. Card contents). */
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();

const haptics = useHaptics();

/**
 * Updates the active value with tactile feedback.
 *
 * @remarks
 * The early return keeps haptics idempotent: re-tapping the already-active
 * segment is a no-op and must not buzz.
 */
function selectOption(targetValue: T) {
  if (props.modelValue === targetValue) return;
  haptics.tap();
  emit("update:modelValue", targetValue);
}
</script>

<template>
  <div
    class="segmented-control"
    :class="{ compact: props.compact }"
  >
    <button
      v-for="optionCandidate in props.options"
      :key="String(optionCandidate.value)"
      class="segment-btn hit-target"
      :class="{ active: props.modelValue === optionCandidate.value }"
      @click.stop="selectOption(optionCandidate.value)"
    >
      <span>{{ optionCandidate.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.segmented-control {
  display: flex;
  background: var(--sys-color-surface-container);
  border-radius: var(--sys-shape-corner-medium);
  padding: 2px;
  border: 1px solid var(--sys-color-outline-variant);
  width: 100%;
}

.segment-btn {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--sys-shape-corner-small);
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--sys-color-on-surface);
  cursor: pointer;
  transition: all var(--sys-motion-duration-200) var(--sys-motion-easing-standard);
  white-space: nowrap;
  opacity: 0.5;
}

.segment-btn.active {
  background: var(--sys-color-surface-container-highest);
  color: var(--sys-color-primary);
  box-shadow: var(--sys-elevation-1);
  opacity: 1;
}

/* COMPACT VARIANT (Used in Cards) */
.segmented-control.compact {
  border-radius: 8px;
  border: none;
  background: var(--sys-color-surface-container);
}

.segmented-control.compact .segment-btn {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--sys-color-on-surface-variant);
  border-radius: 6px;
}

.segmented-control.compact .segment-btn.active {
  color: var(--sys-color-on-surface);
  background: var(--sys-color-surface-container-highest);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* [UX] TOUCH TARGET COMPLIANCE
   Scoped through `.segmented-control` so this expanded hit area outranks the
   generic `:deep(.hit-target)::after { inset: -4px }` rule that tactile
   containers (e.g. BaseCard) project onto their actionable children. */
.segmented-control .segment-btn::after {
  content: "";
  position: absolute;
  inset: -8px -4px;
}
</style>
