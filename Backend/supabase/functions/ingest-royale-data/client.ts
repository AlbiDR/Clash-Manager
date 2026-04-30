// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Defensive Guard: Ensure clinical readiness
if (!CONFIG.CLAN_TAG || !CONFIG.ROYALE_API_KEYS) {
  throw new Error("[CRITICAL] Missing essential environment configuration (CLAN_TAG | ROYALE_API_KEYS)");
}

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`[Protocol-Boot] Substrate initialized for Clan: ${CONFIG.CLAN_TAG}`);
