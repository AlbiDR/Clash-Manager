// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { loadConfig } from "../_shared/vault.ts";
import { setKeys } from "../_shared/muscle.ts";

/**
 * L1 Core: Client & Environment Broker
 * Authoritative source for stack-wide configuration.
 *
 * @remarks
 * This module adheres to the CleanStack Architecture by centralizing environment awareness
 * and utilizing the Supabase Vault to securely manage private keys at runtime.
 */

/**
 * Authoritative central environment configuration map for the fetch-player-battlelog Edge Function.
 *
 * @remarks
 * Properties are initialized from `Deno.env` on boot and can be securely overridden at runtime
 * by pulling decrypted values from the Supabase Vault via `syncVault()`.
 */
export const CONFIG = {
  /** Raw comma-separated string containing valid Royale API tokens or their JSON representations. */
  ROYALE_API_KEYS: Deno.env.get("ROYALE_API_KEYS") || "",
  /** Authoritative database backend endpoint URL. */
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  /** Fully privileged service-role JWT key used to bypass RLS guards for telemetry logging. */
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  /** Anonymous JWT key used for authorization fallback to support direct user testing pathways. */
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
  /** Internal shared bearer token utilized to authenticate service-to-service orchestration calls. */
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

/**
 * Fully privileged client connection instance targeting the Supabase database.
 *
 * @remarks
 * Utilizes the `SUPABASE_SERVICE_ROLE_KEY` to authorize bypass operations on Row Level Security (RLS)
 * guards, enabling asynchronous heartbeat signals, execution audits, and clinical telemetry tracking.
 */
export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Clinical Hardening: Synchronizes local runtime configuration secrets from the secure Supabase Vault.
 *
 * @remarks
 * **Security Context:**
 * - **Satisfaction:** Satisfies ADR Section IV: Operational Security.
 * - **Threat Mitigation:** Prevents plain-text leakage of sensitive credentials (e.g., `INTERNAL_BEARER_TOKEN`,
 *   `ROYALE_API_KEYS`) in container definitions or environment configuration files by fetching them at runtime
 *   directly from secure, encrypted Vault procedures.
 *
 * @sideeffects
 * - Executes database queries targeting Vault configurations.
 * - Mutates local `CONFIG` properties with retrieved values.
 * - Synchronizes the global Royale API key cache utilizing the `setKeys` helper.
 *
 * @returns A promise that resolves once all secrets are parsed, mapped, and synchronized.
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["ROYALE_API_KEYS", "INTERNAL_BEARER_TOKEN", "SUPABASE_ANON_KEY"]);
  if (vault.ROYALE_API_KEYS) {
    CONFIG.ROYALE_API_KEYS = vault.ROYALE_API_KEYS;
    setKeys(vault.ROYALE_API_KEYS);
  }
  if (vault.INTERNAL_BEARER_TOKEN) {
    CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
  }
  if (vault.SUPABASE_ANON_KEY) {
    CONFIG.SUPABASE_ANON_KEY = vault.SUPABASE_ANON_KEY;
  }
}

console.log("[Protocol-Boot] fetch-player-battlelog substrate initialized.");
