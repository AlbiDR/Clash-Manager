// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConfig } from "../_shared/vault.ts";

/**
 * L1 Core: Client & Environment Broker for sync-player-cards.
 *
 * Authoritative source for function-specific configuration.
 * Adheres to the CleanStack Architecture by centralizing environment awareness.
 *
 * @remarks
 * This module follows the 'Clinical Protocol' by prioritizing secrets from the
 * Supabase Vault via the `syncVault` mechanism.
 */

export const CONFIG = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Clinical Hardening: Synchronizes secrets from the Supabase Vault.
 *
 * [THREAT:] Prevents plain-text environment variable exposure in Edge Function
 * configuration by pulling sensitive tokens (like INTERNAL_BEARER_TOKEN)
 * directly from the secure Vault at runtime.
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["INTERNAL_BEARER_TOKEN"]);
  if (vault.INTERNAL_BEARER_TOKEN) CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
}

if (!CONFIG.INTERNAL_BEARER_TOKEN && !Deno.env.get("INTERNAL_BEARER_TOKEN")) {
  console.warn("[WARNING] Missing INTERNAL_BEARER_TOKEN. Relying on Vault sync.");
}
