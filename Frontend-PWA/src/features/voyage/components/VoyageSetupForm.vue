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
import { watch } from "vue";
import { Icon, DurationInput } from "@shared";
import { useVoyageForm } from "../composables/useVoyageForm";
import { getDurationUnits } from "@core/utils/formatters";
import { VOYAGE_DEFAULT_TARGET, VOYAGE_MAX_TARGET } from "@core/config";

const {
  targetCrowns,
  startsIn,
  endsIn,
  isFormValid,
  validationHint,
  isScheduleOnlyMode,
  onTargetInput,
  handleActivate,
  handleCancel,
  store
} = useVoyageForm();

/**
 * Reactivity Logic: Synchronize form with store when an active event is loaded.
 *
 * @remarks
 * This logic is kept in the component to maintain separation between
 * generic form state and specific store synchronization side-effects.
 */
watch(
  () => store.isActive,
  (active) => {
    if (active && store.summary?.event) {
      targetCrowns.value = store.summary.event.target_crowns;

      const endAt = store.summary.event.end_at;
      if (endAt) {
        const diff = new Date(endAt).getTime() - Date.now();
        const units = getDurationUnits(diff);
        endsIn.value = {
          days: units.days,
          hours: units.hours,
          minutes: units.minutes,
        };
      }
    }
  },
  { immediate: true }
);

/**
 * Pre-populate 'Ends In' with a 1-day default for new events
 * to improve user experience (one less field to fill).
 */
watch(
  () => store.status,
  (status) => {
    if (status === 'IDLE' && endsIn.value.days === 0 && endsIn.value.hours === 0 && endsIn.value.minutes === 0) {
      endsIn.value.days = 1;
    }
  },
  { immediate: true }
);
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

    <!-- Starts In (hidden when active or pending, since start is already locked) -->
    <DurationInput
      v-if="!store.isActive && !store.isPending"
      v-model="startsIn"
      label="Starts In"
    />

    <!-- Ends In (shown when active, or in normal direct-activation mode) -->
    <DurationInput
      v-if="store.isActive || (!store.isPending && !isScheduleOnlyMode)"
      v-model="endsIn"
      :label="isAwaitingEndSet ? 'Ends In (set once duration is known)' : 'Ends In'"
    />

    <!-- Validation Hint -->
    <Transition name="hint-fade">
      <p v-if="validationHint" class="validation-hint">
        {{ validationHint }}
      </p>
    </Transition>

    <!-- Set End Time Button (ACTIVE but no end_at) -->
    <button
      v-if="isAwaitingEndSet"
      id="voyage-set-end-btn"
      class="activate-btn"
      :class="{ disabled: !isFormValid, loading: store.loading }"
      @click="handleSetEnd"
      :disabled="store.loading"
    >
      <div class="btn-glow" />
      <span v-if="store.loading">Processing...</span>
      <span v-else>Set End Time</span>
    </button>

    <!-- Activate / Schedule / Update Button (all other states) -->
    <button
      v-else
      id="voyage-activate-btn"
      class="activate-btn"
      :class="{ disabled: !isFormValid, loading: store.loading }"
      @click="handleActivate"
      :disabled="store.isPending || store.loading"
    >
      <div class="btn-glow" />
      <span v-if="store.loading">Processing...</span>
      <span v-else-if="store.isPending">Scheduled</span>
      <span v-else-if="store.isActive">Update Event</span>
      <span v-else-if="isScheduleOnlyMode">Schedule Pre-Event</span>
      <span v-else>Activate Mirror</span>
    </button>

    <!-- Cancel Schedule Link -->
    <button
      v-if="store.isPending"
      id="voyage-cancel-btn"
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
