// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConfig } from "../_shared/vault.ts";

/**
 * L1 Core: Client & Environment Broker for sync-player-cards
 * Authoritative source for function-specific configuration.
 */

export const CONFIG = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "features" } }
);

/**
 * Clinical Hardening: Sync secrets from Vault
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["INTERNAL_BEARER_TOKEN"]);
  if (vault.INTERNAL_BEARER_TOKEN) CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
}

if (!CONFIG.INTERNAL_BEARER_TOKEN && !Deno.env.get("INTERNAL_BEARER_TOKEN")) {
  console.warn("[WARNING] Missing INTERNAL_BEARER_TOKEN. Relying on Vault sync.");
}
