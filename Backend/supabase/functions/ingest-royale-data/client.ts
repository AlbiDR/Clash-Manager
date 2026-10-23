// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2.117.0";
import { loadConfig } from "../_shared/vault.ts";
import { setKeys } from "../_shared/muscle.ts";
import { withSupabaseRequestTracing } from "../_shared/requestTrace.ts";

/**
 * L1 Core: Client & Environment Broker
 *
 * @remarks
 * Authoritative source for Edge Function runtime configuration and Supabase substrate client initialization.
 * Enforces dynamic secret synchronization from database Vault storage when environment variables are omitted.
 *
 * Satisfies CleanStack Architecture ADR Section IV: Data Access & Substrate Isolation.
 *
 * **Architectural Context:**
 * - **Layer:** Backend Edge Function Core (@core)
 * - **Import Boundaries:** May import shared utilities from `_shared/`. Direct cross-function state mutation is forbidden.
 */

/**
 * Mutable runtime environment configuration object for `ingest-royale-data`.
 * Initialized from process environment variables (`Deno.env`), then mutated dynamically during runtime via `syncVault`.
 */
export const CONFIG = {
  CLAN_TAG: Deno.env.get("CLAN_TAG") || "",
  PLAYER_TAG: Deno.env.get("PLAYER_TAG") || "",
  ROYALE_API_KEYS: Deno.env.get("ROYALE_API_KEYS") || "",
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

/**
 * Shared Supabase Service Role client instance.
 * Directs network traffic through `withSupabaseRequestTracing` fetch middleware to monitor outbound request latency.
 */
export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: withSupabaseRequestTracing() } }
);

/**
 * Synchronizes runtime configuration with database Vault secrets.
 *
 * @remarks
 * [DECISION LOG] Vault Fallback Precedence: Primary environment flags are initialized at container boot.
 * If credentials drift or are absent in standard process environment, dynamic fetch from `vault.app_config`
 * refreshes key state without requiring container restart.
 *
 * @param requestClient - Supabase client instance used for querying vault entries (defaults to service role client).
 * @sideeffects
 * - Mutates `CONFIG` object entries (`CLAN_TAG`, `PLAYER_TAG`, `ROYALE_API_KEYS`, `INTERNAL_BEARER_TOKEN`).
 * - Updates round-robin proxy key pool in `muscle.ts` via `setKeys`.
 * @returns Promise resolving when secret updates and dependent sub-system key sets are synchronized.
 */
export async function syncVault(requestClient = supabase) {
  const vault = await loadConfig(requestClient, ["CLAN_TAG", "PLAYER_TAG", "ROYALE_API_KEYS", "INTERNAL_BEARER_TOKEN"]);
  if (vault.CLAN_TAG) {
    CONFIG.CLAN_TAG = vault.CLAN_TAG;
  }
  if (vault.PLAYER_TAG) {
    CONFIG.PLAYER_TAG = vault.PLAYER_TAG;
  }
  if (vault.ROYALE_API_KEYS) {
    CONFIG.ROYALE_API_KEYS = vault.ROYALE_API_KEYS;
    // [DECISION LOG] Sync API key pool with HTTP client worker pool
    setKeys(vault.ROYALE_API_KEYS);
  }
  if (vault.INTERNAL_BEARER_TOKEN) {
    CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
  }
}

// [THREAT: Unconfigured Boot] Emit diagnostic warning if primary target clan tag is absent before Vault initialization.
if (!CONFIG.CLAN_TAG && !Deno.env.get("CLAN_TAG")) {
  console.warn("[WARNING] Missing essential configuration. Relying on Vault sync.");
}

console.log(`[Protocol-Boot] Substrate initialized for Clan: ${CONFIG.CLAN_TAG}`);
