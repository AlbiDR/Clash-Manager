// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createSupabaseClient } from "./SupabaseClient";
import type {
  VoyageContribution,
  VoyageSummary,
} from "@core/types";
import {
  VoyageContributionSchema,
  VoyageSummarySchema
} from "./DataSchemas";
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
 */

/**
 * [VOYAGE] Activates a new Clan Voyage event via the features proxy.
 */
export async function initializeVoyage(target: number, start: string, end: string) {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .rpc('initialize_voyage', {
      target_crowns: target,
      start_at: start,
      end_at: end
    });

  if (error) {
    console.error('[Voyage] RPC Execution Error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return { success: false, error: error.message };
  }

  // data is the JSONB object returned by the function
  return { success: true, data };
}

/**
 * Fetches the voyage summary from the SSOT view.
 *
 * @remarks
 * [GUARD] VALIDATION BOUNDARY: Harden external view data before domain use.
 */
export async function fetchVoyageSummary(): Promise<VoyageSummary | null> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('voyage_summary')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Voyage] Summary fetch error:', error);
    return null;
  }

  if (!data) return null;

  return v.parse(VoyageSummarySchema, data);
}

/**
 * Fetches contribution aggregates from the high-resolution ledger view.
 *
 * @remarks
 * [GUARD] VALIDATION BOUNDARY: Harden external view data before domain use.
 */
export async function fetchVoyageContributions(): Promise<VoyageContribution[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from('voyage_contributions')
    .select('*');

  if (error) {
    console.error('[Voyage] Contributions fetch error:', error);
    return [];
  }

  return v.parse(v.array(VoyageContributionSchema), data || []);
}
