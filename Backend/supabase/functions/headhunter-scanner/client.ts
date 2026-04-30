// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * L1 Core: Client & Environment Broker
 */

export const CONFIG = {
  ROYALE_API_KEYS: Deno.env.get("ROYALE_API_KEYS") || "",
  SUPABASE_URL: Deno.env.get("SUPABASE_URL") || "",
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  INTERNAL_BEARER_TOKEN: Deno.env.get("INTERNAL_BEARER_TOKEN") || "",
};

if (!CONFIG.ROYALE_API_KEYS) {
  throw new Error("[CRITICAL] Missing essential environment configuration (ROYALE_API_KEYS)");
}

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_SERVICE_ROLE_KEY
);
