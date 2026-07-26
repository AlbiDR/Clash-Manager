// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { ref, computed } from "vue";
import { useVoyageStore } from "./useVoyageStore";
import { useToast } from "@core/services/useToast";
import {
  sanitizeNumericInput,
  durationToSeconds
} from "@core";
import {
  VOYAGE_DEFAULT_TARGET,
  VOYAGE_MAX_TARGET
} from "@core/config";
import type { T2TInput } from "./voyageTypes";

/**
 * Representation of relative Time-to-Timestamp (T2T) input units.
 * Supports numeric input or empty string for UI state.
 */
interface FormT2T {
  /** The days portion of the duration. */
  days: number | '';
  /** The hours portion of the duration. */
  hours: number | '';
  /** The minutes portion of the duration. */
  minutes: number | '';
}

/**
 * Interface contract for the object returned by the `useVoyageForm` composable.
 */
export interface UseVoyageFormReturn {
  /** Reactive reference to the target crown input value. */
  targetCrowns: import("vue").Ref<number | ''>;
  /** Reactive reference to the starts-in duration form inputs. */
  startsIn: import("vue").Ref<FormT2T>;
  /** Reactive reference to the ends-in duration form inputs. */
  endsIn: import("vue").Ref<FormT2T>;
  /** Computed boolean indicating whether the current form inputs satisfy validation rules. */
  isFormValid: import("vue").ComputedRef<boolean>;
  /** Computed string containing a user-facing validation warning, or null if form is valid. */
  validationHint: import("vue").ComputedRef<string | null>;
  /** Computed boolean indicating if the form is configured for scheduled-only mode. */
  isScheduleOnlyMode: import("vue").ComputedRef<boolean>;
  /** Computed boolean indicating if the active Voyage is awaiting its end time to be set. */
  isAwaitingEndSet: import("vue").ComputedRef<boolean>;
  /** Input handler for the target crown field that enforces boundary constraints. */
  onTargetInput: () => void;
  /** Async orchestrator to activate or update a Clan Voyage event based on current form state. */
  handleActivate: () => Promise<void>;
  /** Async action to cancel a scheduled pre-event with browser confirmation. */
  handleCancel: () => Promise<void>;
  /** Async action to set the end time on an active Voyage event. */
  handleSetEnd: () => Promise<void>;
  /** The active Pinia store instance for Voyage data. */
  store: ReturnType<typeof useVoyageStore>;
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
 * - **Satisfaction:** Satisfies ADR Section III: Validation Boundaries and ADR Section IV: Operational Security.
 *
 * **Decision Log - Touch targets & Variable Naming Standardization:**
 * - Enforces standard naming conventions by renaming generic catch variables to domain-descriptive
 *   identifiers: `voyageFormActivationError`, `voyageFormCancellationError`, and `voyageFormSetEndError`.
 * - Integrates with `VoyageSetupForm.vue` which complies with the 48px touch footprint standard.
 *
 * @returns {UseVoyageFormReturn} The structured form state and handlers.
 * ============================================================================
 */
export function useVoyageForm(): UseVoyageFormReturn {
  const store = useVoyageStore();
  const toast = useToast();

  // --- FORM STATE ---

  /** Reactive reference for target crowns input. Clamped inside onTargetInput. */
  const targetCrowns = ref<number | ''>(VOYAGE_DEFAULT_TARGET);
  /** Relative starts-in scheduling delay state. */
  const startsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });
  /** Relative ends-in event duration state. */
  const endsIn = ref<FormT2T>({ days: 0, hours: 0, minutes: 0 });

  // --- COMPUTED ---

  /**
   * Total 'Starts In' duration expressed in seconds for comparison.
   * Computed automatically when startsIn fields mutate.
   */
  const totalStartSeconds = computed(() => {
    return durationToSeconds(
      sanitizeNumericInput(startsIn.value.days),
      sanitizeNumericInput(startsIn.value.hours),
      sanitizeNumericInput(startsIn.value.minutes)
    );
  });

  /**
   * Total 'Ends In' duration expressed in seconds for comparison.
   * Computed automatically when endsIn fields mutate.
   */
  const totalEndSeconds = computed(() => {
    return durationToSeconds(
      sanitizeNumericInput(endsIn.value.days),
      sanitizeNumericInput(endsIn.value.hours),
      sanitizeNumericInput(endsIn.value.minutes)
    );
  });

  /**
   * Validated numeric crown target.
   * Coerced from string or empty representation using sanitizeNumericInput utility.
   */
  const safeTargetCrowns = computed(() => sanitizeNumericInput(targetCrowns.value));

  /**
   * Form mode helper.
   * True if the store is IDLE and startsIn duration is configured but endsIn is unconfigured.
   */
  const isScheduleOnlyMode = computed(() => {
    return store.status === 'IDLE' && totalStartSeconds.value > 0 && totalEndSeconds.value === 0;
  });

  /** Returns true if the Voyage is active but has no end time set yet. */
  const isAwaitingEndSet = computed(() => store.isAwaitingEnd);

  /**
   * Comprehensive form validity state.
   * Evaluates target crown boundaries and compares relative durations.
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
   * Provides precise instructions when the form is invalid.
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
   * Input handler for the crown target field.
   * Enforces a hard boundary of [0, VOYAGE_MAX_TARGET] on the target input.
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries.
   * Directly mutates the reactive `targetCrowns` state to clamp out-of-bounds values.
   */
  function onTargetInput() {
    if (targetCrowns.value === '') return;
    if (Number(targetCrowns.value) < 0) targetCrowns.value = 0;
    if (Number(targetCrowns.value) > VOYAGE_MAX_TARGET) {
      targetCrowns.value = VOYAGE_MAX_TARGET;
    }
  }

  /**
   * Orchestrates the setup, activation, or modification of a Clan Voyage event.
   *
   * @remarks
   * Satisfies ADR Section IV: Operational Security & Resilience.
   * - Implements optimistic UI feedback via toasts.
   * - Enforces `isFormValid` check before proceeding.
   * - Centralizes error propagation using safe `unknown` narrowing.
   *
   * @sideeffects
   * - Triggers L1 network RPCs via `useVoyageStore`.
   * - Emits success/error toast notifications.
   * - Updates global feature state in Pinia.
   *
   * @returns {Promise<void>} Promise resolving when the operation completes.
   */
  async function handleActivate() {
    if (store.loading) return;

    if (!isFormValid.value) {
      return;
    }

    try {
      // [DECISION LOG] STRICT NORMALIZATION
      // Rationale: We ensure input units are sanitized to numbers before
      // reaching the store/API to maintain the Validation Boundary.
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
        await store.setVoyageEnd(strictEndsIn);
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
    } catch (voyageFormActivationError: unknown) {
      console.error('[useVoyageForm] handleActivate error:', voyageFormActivationError);
      toast.error(voyageFormActivationError instanceof Error ? voyageFormActivationError.message : "Operation failed.");
    }
  }

  /**
   * Cancels a scheduled pre-event (scheduled voyage).
   *
   * @remarks
   * Satisfies ADR Section IV: Resilience.
   * Requires explicit user confirmation via browser `confirm()` to prevent accidental data loss.
   *
   * @sideeffects
   * - Triggers `cancel_scheduled_voyage` RPC via Pinia store.
   * - Emits toast notifications on success or failure.
   * - Mutates `store.scheduledVoyage` state.
   *
   * @returns {Promise<void>} Promise resolving when the cancellation completes.
   */
  async function handleCancel() {
    if (store.loading) return;
    if (confirm("Are you sure you want to cancel the scheduled Clan Voyage?")) {
      try {
        await store.cancelSchedule();
        toast.success("Scheduled Clan Voyage cancelled.");
      } catch (voyageFormCancellationError: unknown) {
        console.error('[useVoyageForm] handleCancel error:', voyageFormCancellationError);
        toast.error(voyageFormCancellationError instanceof Error ? voyageFormCancellationError.message : "Cancellation failed.");
      }
    }
  }

  /**
   * Sets the end time on an active Voyage event.
   *
   * @remarks
   * Satisfies ADR Section III: Validation Boundaries.
   * Enforces bounds checks on strictEndsIn relative duration before Pinia synchronization.
   *
   * @sideeffects
   * - Triggers `set_voyage_end` RPC on useVoyageStore Pinia layer.
   * - Dispatches success or error toast alerts.
   *
   * @returns {Promise<void>} Promise resolving when the time configuration settles.
   */
  async function handleSetEnd() {
    if (store.loading) return;
    if (!isFormValid.value) return;

    try {
      const strictEndsIn: T2TInput = {
        days: sanitizeNumericInput(endsIn.value.days),
        hours: sanitizeNumericInput(endsIn.value.hours),
        minutes: sanitizeNumericInput(endsIn.value.minutes),
      };
      await store.setVoyageEnd(strictEndsIn);
      toast.success("Voyage end time set successfully.");
    } catch (voyageFormSetEndError: unknown) {
      console.error('[useVoyageForm] handleSetEnd error:', voyageFormSetEndError);
      toast.error(voyageFormSetEndError instanceof Error ? voyageFormSetEndError.message : "Setting end time failed.");
    }
  }

  return {
    targetCrowns,
    startsIn,
    endsIn,
    isFormValid,
    validationHint,
    isScheduleOnlyMode,
    isAwaitingEndSet,
    onTargetInput,
    handleActivate,
    handleCancel,
    handleSetEnd,
    store,
  };
}
