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
  const CLAN_TAG = Deno.env.get("CLAN_TAG");
  const PLAYER_TAG = Deno.env.get("PLAYER_TAG"); // Fetched for potential future use

  const keys = ROYALE_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
  
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "Missing API Keys in Secret Vault" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!CLAN_TAG || !PLAYER_TAG) {
    return new Response(JSON.stringify({ error: "Missing Target Tags in Environment Variables" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 2. Client & Protocol Initialization
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const fetchWithRotation = async (endpoint: string) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      console.log(`[Protocol-Ingest] Hunting with key index ${i}...`);
      const res = await fetch(`https://api.clashroyale.com/v1${endpoint}`, {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (res.status === 403) {
        console.warn(`[Protocol-Ingest] Key ${i} Forbidden (403). Rotating to next...`);
        continue;
      }
      return res;
    }
    throw new Error(`[Protocol-Ingest] All ${keys.length} keys returned 403 Forbidden.`);
  };

  try {
    // 3. Execution Phase: Hunt for Data
    // A. Clan Profile (L0 Substrate)
    console.log(`Hunting for Clan Tag: ${CLAN_TAG}`);
    const profileRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}`);
    
    if (!profileRes.ok) {
      const errBody = await profileRes.text();
      console.error(`Royale API Clan Profile Error (${profileRes.status}): ${errBody}`);
      throw new Error(`Royale API Clan Profile failed with status ${profileRes.status}`);
    }

    const profileData = await profileRes.json();
    const { error: profileError } = await supabase.rpc("ingest_clan_profile", { p_payload: profileData });
    if (profileError) throw new Error(`Profile RPC ingest failed: ${profileError.message}`);

    // B. Member Roster (L0 Substrate)
    console.log(`Hunting for Members of Clan: ${CLAN_TAG}`);
    const membersRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}/members`);

    if (!membersRes.ok) {
      const errBody = await membersRes.text();
      console.error(`Royale API Clan Members Error (${membersRes.status}): ${errBody}`);
      throw new Error(`Royale API Clan Members failed with status ${membersRes.status}`);
    }

    const membersData = await membersRes.json();
    const { error: membersError } = await supabase.rpc("ingest_clan_members", { p_payload: membersData });
    if (membersError) throw new Error(`Members RPC ingest failed: ${membersError.message}`);

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
