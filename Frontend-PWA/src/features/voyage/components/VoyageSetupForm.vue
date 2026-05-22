<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * ============================================================================
 * [FEATURE] VOYAGE SETUP FORM
 * ----------------------------------------------------------------------------
 * Sub-component for configuring and activating a Clan Voyage event.
 * Extracted from EventManagement.vue to maintain SRP and adhere to size limits.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Component (@features)
 * - **Role:** Event setup interface within the Voyage feature.
 * ============================================================================
 */
import { ref, computed, watch } from "vue";
import { Icon } from "@shared";
import { useVoyageStore } from "../composables/useVoyageStore";
import { getDurationUnits } from "@core/utils/formatters";
import type { T2TInput } from "../types";

const store = useVoyageStore();

// --- FORM STATE ---
interface FormT2T {
  days: number | '';
  hours: number | '';
  minutes: number | '';
}

const targetCrowns = ref<number | ''>(1600);
const startsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });
const endsIn   = ref<FormT2T>({ days: 1, hours: 0, minutes: 0 });

watch(
  () => [store.isActive, store.targetCrowns, store.summary?.event?.end_at] as const,
  ([isActive, target, endAt]) => {
    if (isActive) {
      if (target > 0) targetCrowns.value = target;
      if (endAt) {
        const end = new Date(endAt).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        if (diff > 0) {
          const units = getDurationUnits(diff);
          endsIn.value = {
            days: units.days,
            hours: units.hours,
            minutes: units.minutes
          };
        } else {
          endsIn.value = { days: 0, hours: 0, minutes: 0 };
        }
      }
    }
  },
  { immediate: true }
);

// --- VALIDATION ---

/** Normalises a potentially NaN value from an empty number input to 0. */
function sanitize(val: number | '' | null): number {
  if (val === '' || val === null || isNaN(Number(val))) return 0;
  return Number(val) < 0 ? 0 : Number(val);
}

function clampField(obj: FormT2T, key: keyof FormT2T, max: number) {
  if (obj[key] === '') return;
  const sanitized = sanitize(obj[key]);
  if (sanitized > max) {
    obj[key] = max;
  } else if (sanitized < 0) {
    obj[key] = 0;
  }
}

function onStartsInInput(key: keyof FormT2T) {
  const max = key === "days" ? 7 : key === "hours" ? 23 : 59;
  clampField(startsIn.value, key, max);
}

function onEndsInInput(key: keyof FormT2T) {
  const max = key === "days" ? 7 : key === "hours" ? 23 : 59;
  clampField(endsIn.value, key, max);
}

function onTargetInput() {
  if (targetCrowns.value === '') return;
  if (Number(targetCrowns.value) < 0) targetCrowns.value = 0;
  if (Number(targetCrowns.value) > 9999) targetCrowns.value = 9999;
}

const totalStartSeconds = computed(() => {
  const d = sanitize(startsIn.value.days);
  const h = sanitize(startsIn.value.hours);
  const m = sanitize(startsIn.value.minutes);
  return d * 86400 + h * 3600 + m * 60;
});

const totalEndSeconds = computed(() => {
  const d = sanitize(endsIn.value.days);
  const h = sanitize(endsIn.value.hours);
  const m = sanitize(endsIn.value.minutes);
  return d * 86400 + h * 3600 + m * 60;
});

const safeTargetCrowns = computed(() => sanitize(targetCrowns.value));

const isFormValid = computed(() => {
  if (store.isActive) {
    return safeTargetCrowns.value > 0 && totalEndSeconds.value > 0;
  }
  return safeTargetCrowns.value > 0 &&
         totalEndSeconds.value > 0 &&
         totalEndSeconds.value > totalStartSeconds.value;
});

const validationHint = computed(() => {
  if (safeTargetCrowns.value <= 0) return "Set a crown target above 0.";
  if (store.isActive) return null;
  if (totalEndSeconds.value === 0) return "Set an 'Ends In' duration.";
  if (totalEndSeconds.value <= totalStartSeconds.value) return "'Ends In' must be after 'Starts In'.";
  return null;
});

// --- ACTIONS ---
async function handleActivate() {
  if (store.loading) return;

  if (!isFormValid.value) {
    return;
  }

  try {
    const strictStartsIn: T2TInput = {
      days: sanitize(startsIn.value.days),
      hours: sanitize(startsIn.value.hours),
      minutes: sanitize(startsIn.value.minutes),
    };
    const strictEndsIn: T2TInput = {
      days: sanitize(endsIn.value.days),
      hours: sanitize(endsIn.value.hours),
      minutes: sanitize(endsIn.value.minutes),
    };
    await store.activateVoyage(sanitize(targetCrowns.value), strictStartsIn, strictEndsIn);
  } catch (err) {
    console.error('[VoyageSetupForm] handleActivate error:', err);
  }
}
</script>

<template>
  <div class="setup-form">
    <!-- Crown Target -->
    <div class="field-group">
      <label class="field-label" for="voyage-target">Crown Target</label>
      <div class="input-row">
        <input
          id="voyage-target"
          v-model.number="targetCrowns"
          type="number"
          min="1"
          max="9999"
          class="glass-input target-input"
          placeholder="1600"
          @input="onTargetInput"
        />
        <span class="input-suffix"><Icon name="crown" size="14" /></span>
      </div>
    </div>

    <!-- Starts In (Hidden if active to prevent overwriting pipeline dates) -->
    <div v-if="!store.isActive" class="field-group">
      <label class="field-label">Starts In</label>
      <div class="t2t-group">
        <div class="t2t-unit">
          <input
            v-model.number="startsIn.days"
            type="number" min="0" max="7"
            class="glass-input t2t-input"
            @input="onStartsInInput('days')"
          />
          <span class="t2t-label">D</span>
        </div>
        <span class="t2t-sep">:</span>
        <div class="t2t-unit">
          <input
            v-model.number="startsIn.hours"
            type="number" min="0" max="23"
            class="glass-input t2t-input"
            @input="onStartsInInput('hours')"
          />
          <span class="t2t-label">H</span>
        </div>
        <span class="t2t-sep">:</span>
        <div class="t2t-unit">
          <input
            v-model.number="startsIn.minutes"
            type="number" min="0" max="59"
            class="glass-input t2t-input"
            @input="onStartsInInput('minutes')"
          />
          <span class="t2t-label">M</span>
        </div>
      </div>
    </div>

    <!-- Ends In -->
    <div class="field-group">
      <label class="field-label">Ends In</label>
      <div class="t2t-group">
        <div class="t2t-unit">
          <input
            v-model.number="endsIn.days"
            type="number" min="0" max="7"
            class="glass-input t2t-input"
            @input="onEndsInInput('days')"
          />
          <span class="t2t-label">D</span>
        </div>
        <span class="t2t-sep">:</span>
        <div class="t2t-unit">
          <input
            v-model.number="endsIn.hours"
            type="number" min="0" max="23"
            class="glass-input t2t-input"
            @input="onEndsInInput('hours')"
          />
          <span class="t2t-label">H</span>
        </div>
        <span class="t2t-sep">:</span>
        <div class="t2t-unit">
          <input
            v-model.number="endsIn.minutes"
            type="number" min="0" max="59"
            class="glass-input t2t-input"
            @input="onEndsInInput('minutes')"
          />
          <span class="t2t-label">M</span>
        </div>
      </div>
    </div>

    <!-- Validation Hint -->
    <Transition name="hint-fade">
      <p v-if="validationHint" class="validation-hint">
        {{ validationHint }}
      </p>
    </Transition>

    <!-- Activate Button -->
    <button
      class="activate-btn"
      :class="{ disabled: !isFormValid, loading: store.loading }"
      @click="handleActivate"
    >
      <div class="btn-glow" />
      <span v-if="store.loading">Activating...</span>
      <span v-else-if="store.isActive">Update Event</span>
      <span v-else>Activate Mirror</span>
    </button>
  </div>
</template>

<style scoped>
/* --- Form Layout --- */
.setup-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
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

/* --- Inputs --- */
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

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.target-input {
  flex: 1;
  height: 44px;
  padding: 0 14px;
  font-size: 18px;
  text-align: center;
}

.input-suffix {
  font-size: 18px;
  opacity: 0.5;
}

/* --- T2T Group --- */
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
  padding-bottom: 16px; /* Align with number, above label */
}

/* --- Validation Hint --- */
.validation-hint {
  margin: 0;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(var(--sys-color-error-rgb, 239, 68, 68), 0.08);
  color: var(--sys-color-error, #ef4444);
  font-size: 11px;
  font-weight: 700;
}

.hint-fade-enter-active, .hint-fade-leave-active {
  transition: all 0.2s ease;
}
.hint-fade-enter-from, .hint-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* --- Activate Button --- */
.activate-btn {
  width: 100%;
  height: 48px;
  border-radius: 14px;
  border: none;
  background: var(--sys-color-primary);
  color: var(--sys-color-on-primary, #fff);
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 16px rgba(var(--sys-color-primary-rgb), 0.35);
}

.activate-btn:not(.disabled):hover {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(var(--sys-color-primary-rgb), 0.45);
}

.activate-btn:not(.disabled):active {
  transform: scale(0.98);
}

.activate-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  box-shadow: none;
}

.activate-btn.loading {
  opacity: 0.7;
  cursor: wait;
}
</style>
