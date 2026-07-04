// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createSupabaseClient, NetworkError } from "./SupabaseClient";
import type {
  ApiResponse,
  VoyageContribution,
  VoyageViewSummary,
} from "@core/types";
import {
  VoyageContributionSchema,
  VoyageSummarySchema,
  VoyageRpcResultSchema
} from "./VoyageSchemas";
import * as v from "valibot";

/**
 * VOYAGE CLIENT (Layer 1)
 * ----------------------------------------------------------------------------
 * Rationale: Authoritative transport layer for the Clan Voyage feature.
 * Features: Validation Boundaries, RPC Activation, Ledger Fetching.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * Architectural Context:
 * - Layer: Layer 1 (@core)
 * - Import Boundaries: This module is a terminal leaf for API transport.
 *   May import from Layer 1 (@core) and Layer 0 (@substrate).
 *   Imports from Shared (@shared), Features (@features), or App (@app) are forbidden.
 */

/**
 * [VOYAGE] Activates a new Clan Voyage event via the features proxy.
 *
 * @remarks
 * Satisfies ADR Section IV: Deep Delegation Strategy.
 * Triggers the `initialize_voyage` RPC to transition the clan state on the backend.
 *
 * @param target - The goal crown count for the event.
 * @param start - ISO timestamp for event commencement.
 * @param end - ISO timestamp for event conclusion.
 * @returns A Promise resolving to a validated ApiResponse.
 * @throws {NetworkError} If the RPC fails.
 */
export async function initializeVoyage(
  target: number,
  start: string,
  end: string
): Promise<ApiResponse<v.InferOutput<typeof VoyageRpcResultSchema>>> {
  const supabase = createSupabaseClient();

  // [THREAT:] Unvalidated RPC results (Target C) can cause logic corruption.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: rawRpcResponse, error: rpcError } = await supabase
    .rpc('initialize_voyage', {
      target_crowns: target,
      start_at: start,
      end_at: end
    });

  if (rpcError) throw new NetworkError(rpcError.message);

  return {
    success: true,
    data: v.parse(VoyageRpcResultSchema, rawRpcResponse)
  };
}

/**
 * [VOYAGE] Schedules a new Clan Voyage pre-event via features.schedule_voyage RPC.
 *
 * @param target - The goal crown count for the event.
 * @param start - ISO timestamp for event commencement (future).
 * @returns A Promise resolving to a validated ApiResponse.
 * @throws {NetworkError} If the RPC fails.
 */
export async function scheduleVoyageEvent(
  target: number,
  start: string
): Promise<ApiResponse<v.InferOutput<typeof VoyageRpcResultSchema>>> {
  const supabase = createSupabaseClient();

  // [THREAT:] Unvalidated RPC results (Target C) can cause logic corruption.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: rawRpcResponse, error: rpcError } = await supabase
    .rpc('schedule_voyage', {
      target_crowns: target,
      start_at: start
    });

  if (rpcError) throw new NetworkError(rpcError.message);

  return {
    success: true,
    data: v.parse(VoyageRpcResultSchema, rawRpcResponse)
  };
}

/**
 * [VOYAGE] Sets the end time on an already-ACTIVE voyage.
 *
 * @remarks
 * Called after auto-activation fires and the official in-game duration is
 * publicly known. The voyage must already be ACTIVE; the backend enforces
 * this guard.
 *
 * @param voyageId - The ID of the ACTIVE voyage.
 * @param end - ISO timestamp for event conclusion.
 * @returns A Promise resolving to a validated ApiResponse.
 * @throws {NetworkError} If the RPC fails.
 */
export async function setVoyageEnd(
  voyageId: number,
  end: string
): Promise<ApiResponse<v.InferOutput<typeof VoyageRpcResultSchema>>> {
  const supabase = createSupabaseClient();

  // [THREAT:] Unvalidated RPC results (Target C) can cause logic corruption.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: rawRpcResponse, error: rpcError } = await supabase
    .rpc('set_voyage_end', {
      voyage_id: voyageId,
      end_at: end
    });

  if (rpcError) throw new NetworkError(rpcError.message);

  return {
    success: true,
    data: v.parse(VoyageRpcResultSchema, rawRpcResponse)
  };
}

/**
 * [VOYAGE] Cancels a scheduled PENDING voyage.
 *
 * @param voyageId - The ID of the PENDING voyage.
 * @returns A Promise resolving to a validated ApiResponse.
 * @throws {NetworkError} If the RPC fails.
 */
export async function cancelScheduledVoyageEvent(
  voyageId: number
): Promise<ApiResponse<v.InferOutput<typeof VoyageRpcResultSchema>>> {
  const supabase = createSupabaseClient();

  // [THREAT:] Unvalidated RPC results (Target C) can cause logic corruption.
  // [DECISION LOG] Transitioned to strict Valibot validation to enforce data integrity.
  const { data: rawRpcResponse, error: rpcError } = await supabase
    .rpc('cancel_voyage', {
      voyage_id: voyageId
    });

  if (rpcError) throw new NetworkError(rpcError.message);

  return {
    success: true,
    data: v.parse(VoyageRpcResultSchema, rawRpcResponse)
  };
}

/**
 * Fetches the voyage summary from the SSOT view.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Hardens raw view data from `voyage_summary` against the `VoyageSummarySchema`
 * before permitting entry into the domain logic layer. Note that the view does
 * not include per-player contributions; those are fetched separately via
 * {@link fetchVoyageContributions} and merged by the store.
 *
 * @returns A Promise resolving to a validated VoyageViewSummary or null if no active/pending event exists.
 */
export async function fetchVoyageSummary(): Promise<VoyageViewSummary | null> {
  const supabase = createSupabaseClient();

  // [THREAT:] Processing unvalidated raw view data can cause runtime crashes.
  // [DECISION LOG] Implemented strict Valibot validation boundary for summary ingress.
  const { data: rawSummaryPayload, error: summaryFetchError } = await supabase
    .from('voyage_summary')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (summaryFetchError) {
    console.error('[Voyage] Summary fetch error:', summaryFetchError);
    return null;
  }

  if (!rawSummaryPayload) return null;

  return v.parse(VoyageSummarySchema, rawSummaryPayload);
}

/**
 * Fetches contribution aggregates from the high-resolution ledger view.
 *
 * @remarks
 * Satisfies ADR Section III: Validation Boundaries.
 * Hardens raw view data from `voyage_contributions` against the `VoyageContributionSchema`
 * to ensure participant tallies are domain-compliant.
 *
 * @returns A Promise resolving to an array of validated VoyageContribution objects.
 */
export async function fetchVoyageContributions(): Promise<VoyageContribution[]> {
  const supabase = createSupabaseClient();

  // [THREAT:] Processing unvalidated raw ledger data can cause performance metric corruption.
  // [DECISION LOG] Implemented strict Valibot array validation for contribution ingress.
  const { data: rawContributionsPayload, error: contributionsFetchError } = await supabase
    .from('voyage_contributions')
    .select('*');

  if (contributionsFetchError) {
    console.error('[Voyage] Contributions fetch error:', contributionsFetchError);
    return [];
  }

  return v.parse(v.array(VoyageContributionSchema), rawContributionsPayload || []);
}
