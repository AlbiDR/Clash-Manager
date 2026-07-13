// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { type Ref } from "vue";
import type { T2TInput, VoyageSummary } from "./voyageTypes";
import {
  initializeVoyage as apiInitializeVoyage,
  scheduleVoyageEvent as apiScheduleVoyageEvent,
  cancelScheduledVoyageEvent as apiCancelScheduledVoyageEvent,
  setVoyageEnd as apiSetVoyageEnd
} from "@core/api/VoyageClient";
import { t2tToTimestamp } from "@core";
import { VoyageRpcResultSchema } from "@core/api/VoyageSchemas";
import * as v from "valibot";

/**
 * Voyage Actions Orchestrator (Layer 3 Feature Composable)
 *
 * @remarks
 * Architectural Context: Satisfies ADR Section II (Layer 3: Features) by providing
 * a self-contained business silo for Voyage event orchestration.
 *
 * Logic Delegation: Extracted from `useVoyageStore.ts` to satisfy SRP and maintain
 * a clean state management boundary. This composable handles async RPC triggers
 * and response normalization while delegating state updates back to the caller.
 *
 * @param summary - Reactive reference to the current voyage summary (for ID lookup).
 * @param loading - Reactive boolean flag to track active RPC operations.
 * @param refresh - Async callback to trigger a full dataset re-hydration upon successful mutations.
 *
 * @returns Object containing the primary Voyage orchestration actions.
 */
export function useVoyageActions(
  summary: Ref<VoyageSummary | null>,
  loading: Ref<boolean>,
  refresh: () => Promise<void>
) {

  /**
   * Internal helper to handle standardized Supabase RPC responses.
   *
   * @remarks
   * [DECISION LOG] Centralizing response handling eliminates redundant
   * boilerplate and ensures consistent error narrowing across all actions.
   * It enforces the requirement that both the network call and the internal
   * database logic report success before proceeding.
   *
   * @param operation - Descriptive name of the action (used for logging).
   * @param response - Raw response object from the Supabase client.
   * @throws Error if either the network or internal logic fails.
   */
  async function handleRpcResponse(
    operation: string,
    response: { success: boolean; data?: unknown; error?: unknown }
  ) {
    // [THREAT:] Unvalidated RPC responses can mask database failures or inject malformed state.
    // [DECISION LOG] Ensuring both transport success and logical success via Valibot boundaries.
    if (response.success) {
      const validation = v.safeParse(VoyageRpcResultSchema, response.data);

      if (!validation.success) {
        console.error(`[Voyage] ${operation} response validation failed:`, validation.issues);
        throw new Error(`${operation} returned invalid data shape`);
      }

      const rpcResult = validation.output;
      if (rpcResult.success) {
        console.log(`[Voyage] ${operation} successful:`, rpcResult);
        await refresh();
      } else {
        console.error(`[Voyage] ${operation} failed (logic):`, rpcResult.error);
        throw new Error(rpcResult.error ?? `${operation} failed`);
      }
    } else {
      console.error(`[Voyage] ${operation} failed (network/auth):`, response.error);
      throw new Error(String(response.error) ?? `${operation} failed`);
    }
  }

  /**
   * Internal helper to wrap actions with loading state and error narrowing.
   *
   * @remarks
   * Logic Intent: Ensures the reactive `loading` state is strictly managed
   * throughout the async lifecycle.
   *
   * @param operation - Descriptive name of the action.
   * @param action - The async logic to execute within the wrapper.
   * @throws Propagates the narrowed error from the action.
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
   * @remarks
   * Side Effects: Triggers the `refresh` callback upon successful scheduling.
   *
   * @param target - The crown goal for the new Voyage.
   * @param startsIn - Relative duration/time when the event should begin.
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
   * @remarks
   * Side Effects: Triggers the `refresh` callback upon success.
   *
   * @param endsIn - Relative duration from now until the event concludes.
   * @throws Error if no active voyage is found in the `summary` ref or the operation fails.
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
   *
   * @remarks
   * Side Effects: Triggers the `refresh` callback upon successful cancellation.
   *
   * @throws Error if no scheduled voyage is active in the `summary` ref or the operation fails.
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
   * @remarks
   * Side Effects: Triggers the `refresh` callback upon successful activation.
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
