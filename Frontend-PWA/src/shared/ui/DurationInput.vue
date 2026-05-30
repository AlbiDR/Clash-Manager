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
 * ============================================================================
 */
import { sanitizeNumericInput } from "@core/utils/formatters";

interface DurationModel {
  days: number | '';
  hours: number | '';
  minutes: number | '';
}

const props = defineProps<{
  modelValue: DurationModel;
  label?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: DurationModel): void;
}>();

/**
 * Clamps a T2T unit field to its logical maximum and emits update.
 */
function onInput(key: keyof DurationModel) {
  const max = key === "days" ? 7 : key === "hours" ? 23 : 59;
  const newValue = { ...props.modelValue };

  if (newValue[key] !== '') {
    const sanitized = sanitizeNumericInput(newValue[key]);
    if (sanitized > max) {
      newValue[key] = max;
    } else if (sanitized < 0) {
      newValue[key] = 0;
    }
  }

  emit('update:modelValue', newValue);
}
</script>

<template>
  <div class="duration-input">
    <label v-if="label" class="field-label">{{ label }}</label>
    <div class="t2t-group">
      <!-- Days -->
      <div class="t2t-unit">
        <input
          v-model.number="modelValue.days"
          type="number" min="0" max="7"
          class="glass-input t2t-input"
          @input="onInput('days')"
        />
        <span class="t2t-label">D</span>
      </div>
      <span class="t2t-sep">:</span>

      <!-- Hours -->
      <div class="t2t-unit">
        <input
          v-model.number="modelValue.hours"
          type="number" min="0" max="23"
          class="glass-input t2t-input"
          @input="onInput('hours')"
        />
        <span class="t2t-label">H</span>
      </div>
      <span class="t2t-sep">:</span>

      <!-- Minutes -->
      <div class="t2t-unit">
        <input
          v-model.number="modelValue.minutes"
          type="number" min="0" max="59"
          class="glass-input t2t-input"
          @input="onInput('minutes')"
        />
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

.glass-input {
  background: var(--sys-color-surface-container-highest);
  border: 1.5px solid transparent;
  border-radius: 12px;
  color: var(--sys-color-on-surface);
  font-family: var(--sys-font-family-mono);
  font-weight: 800;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  outline: none;
}

.glass-input:focus {
  border-color: var(--sys-color-primary);
  box-shadow: 0 0 0 3px rgba(var(--sys-color-primary-rgb), 0.12);
}

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
