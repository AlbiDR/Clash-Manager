// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Supabase Edge Function: ingest-royale-data
 * Authoritative Hunter for the Binary Universe.
 */
Deno.serve(async (req) => {
  // 1. Fetch Configuration (SSOT from Supabase Secrets set by GitHub)
  const ROYALE_API_KEYS = Deno.env.get("ROYALE_API_KEYS") || "";
  const CLAN_TAG = Deno.env.get("CLAN_TAG") || "#92U0CQ";

  const keys = ROYALE_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
  
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "Missing API Keys in Secret Vault" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Select a Random Key (Rotation Factory)
  const activeKey = keys[Math.floor(Math.random() * keys.length)];
  const headers = { Authorization: `Bearer ${activeKey}` };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 3. Execution Phase: Hunt for Data
    // A. Clan Profile (L0 Substrate)
    const profileRes = await fetch(
      `https://api.clashroyale.com/v1/clans/${encodeURIComponent(CLAN_TAG)}`,
      { headers }
    );
    const profileData = await profileRes.json();
    await supabase.schema("substrate").from("raw_clan_profile").insert({ payload: profileData });

    // B. Member Roster (L0 Substrate)
    const membersRes = await fetch(
      `https://api.clashroyale.com/v1/clans/${encodeURIComponent(CLAN_TAG)}/members`,
      { headers }
    );
    const membersData = await membersRes.json();
    await supabase.schema("substrate").from("raw_clan_members").insert({ payload: membersData });

    return new Response(JSON.stringify({ 
      status: "OK", 
      keys_in_farm: keys.length,
      ingested_at: new Date().toISOString() 
    }), { 
      headers: { "Content-Type": "application/json" } 
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
