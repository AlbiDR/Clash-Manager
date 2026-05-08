// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConfig } from "../_shared/vault.ts";

/**
 * L1 Core: Client & Environment Broker
 */

export const CONFIG = {
  ROYALE_API_KEYS: Deno.env.get("ROYALE_API_KEYS") || "",
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Clinical Hardening: Sync secrets from Vault
 * Overwrites environment variables with authoritative Vault data if present.
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["ROYALE_API_KEYS", "INTERNAL_BEARER_TOKEN"]);
  if (vault.ROYALE_API_KEYS) CONFIG.ROYALE_API_KEYS = vault.ROYALE_API_KEYS;
  if (vault.INTERNAL_BEARER_TOKEN) CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
}

if (!CONFIG.ROYALE_API_KEYS && !Deno.env.get("ROYALE_API_KEYS")) {
  console.warn("[WARNING] No ROYALE_API_KEYS found in environment. Relying on Vault sync.");
}
