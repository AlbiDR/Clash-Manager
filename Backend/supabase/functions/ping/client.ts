// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "npm:@supabase/supabase-js@2.110.8";

/**
 * L1 Core: Client & Environment Broker for ping.
 *
 * @remarks
 * Deliberately the thinnest CONFIG of any function in this repo: a health-check
 * handshake needs no vault-managed secrets (no ROYALE_API_KEYS, no CLAN_TAG), so this
 * skips `syncVault` entirely and reads straight from the deployed environment.
 */
export const CONFIG = {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
};

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);
