// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";
import { useVoyageStore } from "./useVoyageStore";
import { useToast } from "@core/services/useToast";
import {
  sanitizeNumericInput,
  durationToSeconds
} from "@core/utils/formatters";
import {
  VOYAGE_DEFAULT_TARGET,
  VOYAGE_MAX_TARGET
} from "@core/config";
import type { T2TInput } from "../types";

/**
 * Representation of relative Time-to-Timestamp (T2T) input units.
 * Supports numeric input or empty string for UI state.
 */
interface FormT2T {
  days: number | '';
  hours: number | '';
  minutes: number | '';
}

/**
 * COMPOSABLE: USE VOYAGE FORM
 * ----------------------------------------------------------------------------
 * Orchestrates form state, validation, and actions for Clan Voyage setup.
 *
 * @remarks
 * **Architectural Context:**
 * - **Layer:** Layer 3 Feature Composable (@features/voyage)
 * - **Role:** Decouples form logic from the UI view.
 * ============================================================================
 */
export function useVoyageForm() {
  const store = useVoyageStore();
  const toast = useToast();

  // --- FORM STATE ---

  const targetCrowns = ref<number | ''>(VOYAGE_DEFAULT_TARGET);
  const startsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });
  const endsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });

  // --- COMPUTED ---

  /** Total 'Starts In' duration expressed in seconds for comparison. */
  const totalStartSeconds = computed(() => {
    return durationToSeconds(
      sanitizeNumericInput(startsIn.value.days),
      sanitizeNumericInput(startsIn.value.hours),
      sanitizeNumericInput(startsIn.value.minutes)
    );
  });

  /** Total 'Ends In' duration expressed in seconds for comparison. */
  const totalEndSeconds = computed(() => {
    return durationToSeconds(
      sanitizeNumericInput(endsIn.value.days),
      sanitizeNumericInput(endsIn.value.hours),
      sanitizeNumericInput(endsIn.value.minutes)
    );
  });

  /** Validated numeric crown target. */
  const safeTargetCrowns = computed(() => sanitizeNumericInput(targetCrowns.value));

  /** Form mode helper */
  const isScheduleOnlyMode = computed(() => {
    return store.status === 'IDLE' && totalStartSeconds.value > 0 && totalEndSeconds.value === 0;
  });

  /**
   * Comprehensive form validity state.
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
   * Enforces a hard boundary of [0, VOYAGE_MAX_TARGET] on the target input.
   */
  function onTargetInput() {
    if (targetCrowns.value === '') return;
    if (Number(targetCrowns.value) < 0) targetCrowns.value = 0;
    if (Number(targetCrowns.value) > VOYAGE_MAX_TARGET) {
      targetCrowns.value = VOYAGE_MAX_TARGET;
    }
  }

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
        days: sanitizeNumericInput(startsIn.value.days),
        hours: sanitizeNumericInput(startsIn.value.hours),
        minutes: sanitizeNumericInput(startsIn.value.minutes),
      };
      const strictEndsIn: T2TInput = {
        days: sanitizeNumericInput(endsIn.value.days),
        hours: sanitizeNumericInput(endsIn.value.hours),
        minutes: sanitizeNumericInput(endsIn.value.minutes),
      };

      if (store.isAwaitingEnd) {
        await store.activateScheduledVoyage(safeTargetCrowns.value, strictEndsIn);
        toast.success("Clan Voyage activated successfully.");
      } else if (isScheduleOnlyMode.value) {
        await store.scheduleVoyage(safeTargetCrowns.value, strictStartsIn);
        toast.success("Pre-event scheduled successfully.");
      } else if (store.isActive) {
        await store.activateVoyage(safeTargetCrowns.value, strictStartsIn, strictEndsIn);
        toast.success("Voyage event updated successfully.");
      } else {
        await store.activateVoyage(safeTargetCrowns.value, strictStartsIn, strictEndsIn);
        toast.success("Clan Voyage activated successfully.");
      }
    } catch (err: unknown) {
      console.error('[useVoyageForm] handleActivate error:', err);
      toast.error(err instanceof Error ? err.message : "Operation failed.");
    }
  }

  /** Cancels a scheduled pre-event */
  async function handleCancel() {
    if (store.loading) return;
    if (confirm("Are you sure you want to cancel the scheduled Clan Voyage?")) {
      try {
        await store.cancelSchedule();
        toast.success("Scheduled Clan Voyage cancelled.");
      } catch (err: unknown) {
        console.error('[useVoyageForm] handleCancel error:', err);
        toast.error(err instanceof Error ? err.message : "Cancellation failed.");
      }
    }
  }

  return {
    targetCrowns,
    startsIn,
    endsIn,
    isFormValid,
    validationHint,
    isScheduleOnlyMode,
    onTargetInput,
    handleActivate,
    handleCancel,
    store,
  };
}
