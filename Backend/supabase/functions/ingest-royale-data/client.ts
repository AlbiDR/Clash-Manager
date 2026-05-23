// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2";
import { loadConfig } from "../_shared/vault.ts";
import { setKeys } from "../_shared/muscle.ts";

/**
 * L1 Core: Client & Environment Broker
 * Authoritative source for stack-wide configuration.
 */

export const CONFIG = {
  CLAN_TAG: Deno.env.get("CLAN_TAG") || "",
  PLAYER_TAG: Deno.env.get("PLAYER_TAG") || "",
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
 */
export async function syncVault() {
  const vault = await loadConfig(supabase, ["CLAN_TAG", "PLAYER_TAG", "ROYALE_API_KEYS", "INTERNAL_BEARER_TOKEN"]);
  if (vault.CLAN_TAG) {
    CONFIG.CLAN_TAG = vault.CLAN_TAG;
  }
  if (vault.PLAYER_TAG) {
    CONFIG.PLAYER_TAG = vault.PLAYER_TAG;
  }
  if (vault.ROYALE_API_KEYS) {
    CONFIG.ROYALE_API_KEYS = vault.ROYALE_API_KEYS;
    setKeys(vault.ROYALE_API_KEYS);
  }
  if (vault.INTERNAL_BEARER_TOKEN) {
    CONFIG.INTERNAL_BEARER_TOKEN = vault.INTERNAL_BEARER_TOKEN;
  }
}

if (!CONFIG.CLAN_TAG && !Deno.env.get("CLAN_TAG")) {
  console.warn("[WARNING] Missing essential configuration. Relying on Vault sync.");
}

console.log(`[Protocol-Boot] Substrate initialized for Clan: ${CONFIG.CLAN_TAG}`);
