// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { type Ref } from "vue";
import type { T2TInput, VoyageSummary } from "../types";
import {
  initializeVoyage as apiInitializeVoyage,
  scheduleVoyageEvent as apiScheduleVoyageEvent,
  cancelScheduledVoyageEvent as apiCancelScheduledVoyageEvent,
  setVoyageEnd as apiSetVoyageEnd
} from "@core/api/VoyageClient";
import { t2tToTimestamp } from "@core/utils/formatters";

/**
 * COMPOSABLE: useVoyageActions
 * ----------------------------------------------------------------------------
 * Rationale: Decomposed logic for Voyage event orchestration and RPC handling.
 * Reduces complexity in useVoyageStore.ts to satisfy SRP (<400 lines).
 * ----------------------------------------------------------------------------
 */
export function useVoyageActions(
  summary: Ref<VoyageSummary | null>,
  loading: Ref<boolean>,
  refresh: () => Promise<void>
) {

  /**
   * Internal helper to handle standardized Supabase RPC responses.
   * [DECISION LOG] Centralizing response handling eliminates redundant
   * boilerplate and ensures consistent error narrowing across all actions.
   */
  async function handleRpcResponse(
    operation: string,
    response: { success: boolean; data?: any; error?: any }
  ) {
    if (response.success) {
      const result = response.data as { success: boolean; error?: string };
      if (result.success) {
        console.log(`[Voyage] ${operation} successful:`, result);
        await refresh();
      } else {
        console.error(`[Voyage] ${operation} failed (logic):`, result.error);
        throw new Error(result.error ?? `${operation} failed`);
      }
    } else {
      console.error(`[Voyage] ${operation} failed (network/auth):`, response.error);
      throw new Error(String(response.error) ?? `${operation} failed`);
    }
  }

  /**
   * Internal helper to wrap actions with loading state and error narrowing.
   */
  async function executeAction(operation: string, action: () => Promise<void>) {
    loading.value = true;
    try {
      await action();
    } catch (err: unknown) {
      // [THREAT:] Unhandled 'any' exceptions can leak internal stack traces.
      // [DECISION LOG] Narrowing 'unknown' error to ensure safe logging and propagation.
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[Voyage] ${operation} action error:`, errorMessage);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Schedules a new PENDING Voyage event in the future.
   *
   * @param target - The crown goal.
   * @param startsIn - Relative time when it starts.
   */
  async function scheduleVoyage(target: number, startsIn: T2TInput) {
    await executeAction("Schedule", async () => {
      const start_at = t2tToTimestamp(startsIn);
      const response = await apiScheduleVoyageEvent(target, start_at);
      await handleRpcResponse("Scheduling", response);
    });
  }

  /**
   * Sets the end time on an already-ACTIVE Voyage event.
   *
   * @param endsIn - Relative duration from now until the event concludes.
   * @throws Error if no active voyage is found or the operation fails.
   */
  async function setVoyageEnd(endsIn: T2TInput) {
    const voyageId = summary.value?.event.id;
    if (!voyageId) throw new Error("No active voyage found.");

    await executeAction("Set end time", async () => {
      const end_at = t2tToTimestamp(endsIn);
      const response = await apiSetVoyageEnd(voyageId, end_at);
      await handleRpcResponse("Setting end time", response);
    });
  }

  /**
   * Cancels the currently scheduled PENDING Voyage event.
   * @throws Error if no scheduled voyage exists or the operation fails.
   */
  async function cancelSchedule() {
    const voyageId = summary.value?.event.id;
    if (!voyageId) throw new Error("No scheduled voyage is active.");

    await executeAction("Cancel schedule", async () => {
      const response = await apiCancelScheduledVoyageEvent(voyageId);
      await handleRpcResponse("Cancellation", response);
    });
  }

  /**
   * Activates a new Voyage event via Supabase RPC (Direct IMMEDIATE ACTIVE).
   *
   * @param target - The crown goal for the new Voyage.
   * @param startsIn - Relative duration until the event begins.
   * @param endsIn - Relative duration until the event concludes.
   * @throws Error if the activation fails.
   */
  async function activateVoyage(
    target: number,
    startsIn: T2TInput,
    endsIn: T2TInput
  ) {
    await executeAction("Activation", async () => {
      const start_at = t2tToTimestamp(startsIn);
      const end_at = t2tToTimestamp(endsIn);

      const response = await apiInitializeVoyage(target, start_at, end_at);
      await handleRpcResponse("Activation", response);
    });
  }

  return {
    scheduleVoyage,
    setVoyageEnd,
    cancelSchedule,
    activateVoyage,
  };
}
