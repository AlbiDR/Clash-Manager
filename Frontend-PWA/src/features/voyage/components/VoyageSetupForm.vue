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
 * - **Validation Boundary:** Satisfies ADR Section III: Validation Boundaries.
 *   Enforces domain-specific constraints on crown targets and event durations
 *   before backend activation.
 * ============================================================================
 */
import { ref, computed, watch } from "vue";
import { Icon, DurationInput } from "@shared";
import { useVoyageStore } from "../composables/useVoyageStore";
import { getDurationUnits } from "@core/utils/formatters";
import { VOYAGE_DEFAULT_TARGET, VOYAGE_MAX_TARGET } from "@core/config";
import type { T2TInput } from "../types";

const store = useVoyageStore();

// --- FORM STATE ---

/**
 * Representation of relative Time-to-Timestamp (T2T) input units.
 * Supports numeric input or empty string for UI state.
 */
interface FormT2T {
  days: number | '';
  hours: number | '';
  minutes: number | '';
}

/** The primary crown goal for the Voyage event. Clamped between 1-9999. */
const targetCrowns = ref<number | ''>(VOYAGE_DEFAULT_TARGET);

/** Relative delay until the event begins. Zero indicates immediate start. */
const startsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });

/** Relative duration until the event concludes. Must be greater than startsIn. */
const endsIn   = ref<FormT2T>({ days: 1, hours: 0, minutes: 0 });

// [DECISION LOG] STATE SYNCHRONIZATION
// Rationale: When an event is active or pending, we populate the form from the store state
// to provide context and allow for "Update Event" or promotion/cancellation workflows.
watch(
  () => [
    store.isActive,
    store.isPending,
    store.isAwaitingEnd,
    store.targetCrowns,
    store.summary?.event?.end_at
  ] as const,
  ([isActive, isPending, isAwaitingEnd, target, endAt]) => {
    if (isActive || isPending || isAwaitingEnd) {
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

/**
 * Normalises a potentially NaN value from an empty number input to 0.
 *
 * @param val - The raw input value.
 * @returns A safe numeric representation.
 */
function sanitize(val: number | '' | null): number {
  if (val === '' || val === null || isNaN(Number(val))) return 0;
  return Number(val) < 0 ? 0 : Number(val);
}

/**
 * Event handler for the primary crown target input.
 * Enforces a hard boundary of [0, VOYAGE_MAX_TARGET].
 */
function onTargetInput() {
  if (targetCrowns.value === '') return;
  if (Number(targetCrowns.value) < 0) targetCrowns.value = 0;
  if (Number(targetCrowns.value) > VOYAGE_MAX_TARGET) {
    targetCrowns.value = VOYAGE_MAX_TARGET;
  }
}

/** Total 'Starts In' duration expressed in seconds for comparison. */
const totalStartSeconds = computed(() => {
  const d = sanitize(startsIn.value.days);
  const h = sanitize(startsIn.value.hours);
  const m = sanitize(startsIn.value.minutes);
  return d * 86400 + h * 3600 + m * 60;
});

/** Total 'Ends In' duration expressed in seconds for comparison. */
const totalEndSeconds = computed(() => {
  const d = sanitize(endsIn.value.days);
  const h = sanitize(endsIn.value.hours);
  const m = sanitize(endsIn.value.minutes);
  return d * 86400 + h * 3600 + m * 60;
});

/** Validated numeric crown target. */
const safeTargetCrowns = computed(() => sanitize(targetCrowns.value));

/** Form mode helper */
const isScheduleOnlyMode = computed(() => {
  // If we are idle, startsIn is set but endsIn is not.
  return store.status === 'IDLE' && totalStartSeconds.value > 0 && totalEndSeconds.value === 0;
});

/**
 * Comprehensive form validity state.
 * Rationale:
 * - In Active Update mode: crowns > 0 && endsIn > 0.
 * - In Awaiting End mode (promoting PENDING): crowns > 0 && endsIn > 0.
 * - In Schedule-Only mode: crowns > 0 && startsIn > 0 && endsIn == 0.
 * - In Normal direct activation mode: crowns > 0 && endsIn > startsIn.
 */
const isFormValid = computed(() => {
  if (safeTargetCrowns.value <= 0) return false;

  if (store.isActive) {
    return totalEndSeconds.value > 0;
  }
  if (store.isAwaitingEnd) {
    return totalEndSeconds.value > 0;
  }
  if (isScheduleOnlyMode.value) {
    return totalStartSeconds.value > 0;
  }

  // Normal mode direct activation: endsIn must be filled and greater than startsIn
  return totalEndSeconds.value > 0 && totalEndSeconds.value > totalStartSeconds.value;
});

/**
 * User-facing validation feedback string.
 */
const validationHint = computed(() => {
  if (safeTargetCrowns.value <= 0) return "Set a crown target above 0.";
  if (store.isActive || store.isAwaitingEnd) {
    if (totalEndSeconds.value === 0) return "Set an 'Ends In' duration.";
    return null;
  }
  if (isScheduleOnlyMode.value) return null;

  if (totalEndSeconds.value === 0 && totalStartSeconds.value === 0) {
    return "Set an 'Ends In' duration or a 'Starts In' scheduling delay.";
  }
  if (totalEndSeconds.value > 0 && totalEndSeconds.value <= totalStartSeconds.value) {
    return "'Ends In' must be after 'Starts In'.";
  }
  return null;
});

// --- ACTIONS ---

/**
 * Orchestrates the activation, scheduling, promotion, or update of a Clan Voyage.
 */
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

    if (store.isAwaitingEnd) {
      // Promoting a PENDING voyage whose start time has already passed
      await store.activateScheduledVoyage(safeTargetCrowns.value, strictEndsIn);
    } else if (isScheduleOnlyMode.value) {
      // Scheduling a pre-event with start time only
      await store.scheduleVoyage(safeTargetCrowns.value, strictStartsIn);
    } else if (store.isActive) {
      // Modifying active target/ends duration
      await store.activateVoyage(safeTargetCrowns.value, strictStartsIn, strictEndsIn);
    } else {
      // Normal direct activation (both set immediately or immediate activation)
      await store.activateVoyage(safeTargetCrowns.value, strictStartsIn, strictEndsIn);
    }
  } catch (err) {
    console.error('[VoyageSetupForm] handleActivate error:', err);
  }
}

/** Cancels a scheduled pre-event */
async function handleCancel() {
  if (store.loading) return;
  if (confirm("Are you sure you want to cancel the scheduled Clan Voyage?")) {
    try {
      await store.cancelSchedule();
    } catch (err) {
      console.error('[VoyageSetupForm] handleCancel error:', err);
    }
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
          :max="VOYAGE_MAX_TARGET"
          class="glass-input target-input"
          :placeholder="String(VOYAGE_DEFAULT_TARGET)"
          @input="onTargetInput"
          :disabled="store.isPending"
        />
        <span class="input-suffix"><Icon name="crown" size="14" /></span>
      </div>
    </div>

    <!-- Starts In (Hidden if active or promoting scheduled, since startsIn is locked) -->
    <DurationInput
      v-if="!store.isActive && !store.isAwaitingEnd && !store.isPending"
      v-model="startsIn"
      label="Starts In"
    />

    <!-- Ends In (Hidden if we are only scheduling a pre-event with startsIn) -->
    <DurationInput
      v-if="!store.isPending"
      v-model="endsIn"
      label="Ends In"
    />

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
      :disabled="store.isPending"
    >
      <div class="btn-glow" />
      <span v-if="store.loading">Processing...</span>
      <span v-else-if="store.isPending">Scheduled</span>
      <span v-else-if="store.isAwaitingEnd">Activate Scheduled Event</span>
      <span v-else-if="store.isActive">Update Event</span>
      <span v-else-if="isScheduleOnlyMode">Schedule Pre-Event</span>
      <span v-else>Activate Mirror</span>
    </button>

    <!-- Cancel Schedule Link -->
    <button
      v-if="store.isPending || store.isAwaitingEnd"
      class="cancel-btn"
      :class="{ disabled: store.loading }"
      @click="handleCancel"
    >
      Cancel Schedule
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

.glass-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* --- Cancel Button --- */
.cancel-btn {
  background: none;
  border: none;
  color: var(--sys-color-error, #ef4444);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 8px 0;
  transition: opacity 0.2s ease;
  align-self: center;
}

.cancel-btn:hover:not(.disabled) {
  opacity: 0.8;
  text-decoration: underline;
}

.cancel-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
