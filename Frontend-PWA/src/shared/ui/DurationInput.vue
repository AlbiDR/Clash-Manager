<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [SHARED UI] DURATION INPUT
 * ----------------------------------------------------------------------------
 * A domain-blind component for relative Time-to-Timestamp (T2T) input.
 * Provides a standardized Days/Hours/Minutes interface with auto-clamping.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 2 Shared UI (@shared/ui)
 * - **Role:** Reusable input molecule for duration/countdown configurations.
 * - **Permitted Imports:** `@core` utilities and Vue reactivity primitives.
 *
 * Satisfies ADR Section II: Presentation Orchestration & Layer Boundaries.
 * Satisfies ADR Section III: Validation Boundaries & Input Sanitization.
 * ============================================================================
 */
import { sanitizeNumericInput } from "@core";

/**
 * Data shape representing relative time-to-timestamp duration units.
 */
interface DurationModel {
  /** Relative number of days (0-7), or empty string when cleared. */
  days: number | '';
  /** Relative number of hours (0-23), or empty string when cleared. */
  hours: number | '';
  /** Relative number of minutes (0-59), or empty string when cleared. */
  minutes: number | '';
}

/**
 * Component props for DurationInput.
 */
const props = defineProps<{
  /** Reactive duration model bound to inputs. */
  modelValue: DurationModel;
  /** Optional header label for input group. */
  label?: string;
}>();

/**
 * Event emissions for DurationInput.
 */
const emit = defineEmits<{
  /** Emitted whenever any unit field value changes or is clamped. */
  (e: 'update:modelValue', value: DurationModel): void;
}>();

/**
 * Clamps a T2T unit field to its logical maximum and emits update.
 *
 * @remarks
 * Enforces strict upper bounds (Days: 7, Hours: 23, Minutes: 59) and lower bound (0).
 * Prevents invalid durations from propagating to core calculations or persistence.
 *
 * [DECISION LOG] Uses `sanitizeNumericInput` from `@core` to parse and strip invalid characters.
 * [THREAT:] Unsanitized negative or out-of-bounds duration values causing invalid timestamp computations.
 *
 * @param event - The native input event; read directly since `modelValue` is never mutated in place.
 * @param durationUnitKey - The target duration field ('days' | 'hours' | 'minutes') being modified.
 * @sideeffects Emits `update:modelValue` event with normalized duration model.
 */
function onInput(event: Event, durationUnitKey: keyof DurationModel) {
  const max = durationUnitKey === "days" ? 7 : durationUnitKey === "hours" ? 23 : 59;
  const target = event.target as HTMLInputElement;
  const rawValue = target.value === '' ? '' : Number(target.value);
  const newValue = { ...props.modelValue, [durationUnitKey]: rawValue };

  if (newValue[durationUnitKey] !== '') {
    const sanitized = sanitizeNumericInput(newValue[durationUnitKey]);
    newValue[durationUnitKey] = sanitized > max ? max : sanitized;
  }

  emit('update:modelValue', newValue);
}
</script>

<template>
  <div class="duration-input">
    <label
      v-if="label"
      class="field-label"
    >{{ label }}</label>
    <div class="t2t-group">
      <!-- Days -->
      <div class="t2t-unit">
        <input
          :value="modelValue.days"
          type="number"
          min="0"
          max="7"
          class="glass-input t2t-input"
          @input="onInput($event, 'days')"
        >
        <span class="t2t-label">D</span>
      </div>
      <span class="t2t-sep">:</span>

      <!-- Hours -->
      <div class="t2t-unit">
        <input
          :value="modelValue.hours"
          type="number"
          min="0"
          max="23"
          class="glass-input t2t-input"
          @input="onInput($event, 'hours')"
        >
        <span class="t2t-label">H</span>
      </div>
      <span class="t2t-sep">:</span>

      <!-- Minutes -->
      <div class="t2t-unit">
        <input
          :value="modelValue.minutes"
          type="number"
          min="0"
          max="59"
          class="glass-input t2t-input"
          @input="onInput($event, 'minutes')"
        >
        <span class="t2t-label">M</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.duration-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.45;
}

/* .glass-input is a global field-surface primitive in @core/theme/components.ts.
   This component supplies only the dimensions, via .t2t-input below. */

.t2t-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.t2t-unit {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.t2t-input {
  width: 100%;
  height: 48px;
  font-size: 20px;
  text-align: center;
  padding: 0;
}

.t2t-label {
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.35;
}

.t2t-sep {
  font-size: 22px;
  font-weight: 900;
  opacity: 0.2;
  padding-bottom: 16px;
}
</style>
