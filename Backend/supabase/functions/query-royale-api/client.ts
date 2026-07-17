// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import { loadConfig } from "../_shared/vault.ts";
import { setKeys } from "../_shared/muscle.ts";

/**
 * L1 Core: Client & Environment Broker for query-royale-api.
 *
 * Authoritative source for function-specific configuration.
 * Adheres to the CleanStack Architecture by centralizing environment awareness.
 */

export const CONFIG = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
  CLAN_TAG: Deno.env.get("CLAN_TAG") || "",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Clinical Hardening: Synchronizes secrets from the Supabase Vault.
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["INTERNAL_BEARER_TOKEN", "ROYALE_API_KEYS", "CLAN_TAG"]);
  if (vault.INTERNAL_BEARER_TOKEN) {
    CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
  }
  if (vault.ROYALE_API_KEYS) {
    setKeys(vault.ROYALE_API_KEYS);
  }
  if (vault.CLAN_TAG) {
    CONFIG.CLAN_TAG = vault.CLAN_TAG;
  }
}

if (!CONFIG.INTERNAL_BEARER_TOKEN && !Deno.env.get("INTERNAL_BEARER_TOKEN")) {
  console.warn("[WARNING] Missing INTERNAL_BEARER_TOKEN. Relying on Vault sync.");
}
