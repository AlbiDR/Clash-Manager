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

  console.log(`[Diagnostic] Found ROYALE_API_KEYS string length: ${ROYALE_API_KEYS.length}`);
  let keys: string[] = [];
  try {
    // A. Strategy 1: JSON Array
    const parsed = JSON.parse(ROYALE_API_KEYS);
    keys = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`[Diagnostic] Strategy: JSON Array. Count: ${keys.length}`);
  } catch {
    // B. Strategy 2: Comma Separated (Legacy/Standard)
    keys = ROYALE_API_KEYS.split(",").map(k => k.trim()).filter(Boolean);
    console.log(`[Protocol-Ingest] Strategy: Comma-Separated. Count: ${keys.length}`);
  }
  
  // Minimalist Sanitized Check: Log length and edge characters of each key
  keys.forEach((k, idx) => {
    const preview = `${k.substring(0, 4)}...${k.substring(k.length - 4)}`;
    console.log(`[Diagnostic] Key ${idx}: Length=${k.length} Preview=${preview}`);
  });
  
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: "Missing API Keys in Secret Vault (Format Error?)" }), { 
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
    // True Round-Robin: Start at a random index and loop through all keys.
    const startIndex = Math.floor(Math.random() * keys.length);
    
    for (let i = 0; i < keys.length; i++) {
      const targetIndex = (startIndex + i) % keys.length;
      let key = keys[targetIndex].trim();
      
      // Sanitization: remove surrounding quotes if present
      if (key.startsWith('"') && key.endsWith('"')) {
        key = key.substring(1, key.length - 1);
      }
      
      console.log(`[Protocol-Ingest] Hunting with key index ${targetIndex} (Step ${i+1}/${keys.length})...`);
      
      // Using RoyaleAPI Proxy to bypass IP restrictions
      const res = await fetch(`https://proxy.royaleapi.dev/v1${endpoint}`, {
        headers: { 
          Authorization: `Bearer ${key}`,
          "Accept": "application/json"
        }
      });
      
      if (res.status === 403) {
        console.warn(`[Protocol-Ingest] Key ${targetIndex} Forbidden (403). Rotating to next...`);
        continue;
      }
      return res;
    }
    throw new Error(`[Protocol-Ingest] All ${keys.length} keys returned 403 Forbidden via Proxy.`);
  };

    // -------------------------------------------------------------------------
    // CLINICAL QUAD-STAGE INGESTION PIPELINE (v7.4.0 Stable)
    // S1: Profile | S2: Members | S3: Current River Race | S4: War Log
    // -------------------------------------------------------------------------
    const results = { profile: false, members: false, race: false, warlog: false };

    // --- STAGE 1: CLAN PROFILE ---
    try {
      const profileRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}`);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const { error: pErr } = await supabase.rpc('ingest_clan_profile', { p_payload: profileData });
        if (!pErr) results.profile = true;
      }
    } catch (e) { console.error('[v7.4.0] S1 Profile Failed:', e.message); }

    // --- STAGE 2: CLAN MEMBERS ---
    try {
      const membersRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}/members`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const { error: mErr } = await supabase.rpc('ingest_clan_members', { p_payload: membersData });
        if (!mErr) results.members = true;
      }
    } catch (e) { console.error('[v7.4.0] S2 Members Failed:', e.message); }

    // --- STAGE 3: CURRENT RIVER RACE (War Activity) ---
    try {
      const raceRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}/currentriverrace`);
      if (raceRes.ok) {
        const raceData = await raceRes.json();
        const { error: rErr } = await supabase.rpc('ingest_river_race', { p_payload: raceData });
        if (!rErr) results.race = true;
      }
    } catch (e) { console.error('[v7.4.0] S3 River Race Failed:', e.message); }

    // --- STAGE 4: WAR LOG (Historical Discovery) ---
    try {
      const warlogRes = await fetchWithRotation(`/clans/${encodeURIComponent(CLAN_TAG)}/warlog`);
      if (warlogRes.ok) {
        const warlogData = await warlogRes.json();
        // The RPC 'ingest_war_log' UPSERTS - building history over weeks.
        const { error: wErr } = await supabase.rpc('ingest_war_log', { 
            p_payload: warlogData 
        });
        if (!wErr) results.warlog = true;
      }
    } catch (e) { console.error('[v18.1.0] S4 War Log Failed:', e.message); }

    // --- STAGE 5: DEEP DEPTH (Individual Career Logs) ---
    // This accumulates 100 battles per resident for deep performance scoring.
    try {
        const { data: members, error: mErr } = await supabase
            .from('members')
            .select('tag')
            .eq('snapshot_date', new Date().toISOString().split('T')[0]);
        
        if (!mErr && members) {
            console.log(`[v18.1.0] S5: Ingesting Battles for ${members.length} Residents.`);
            for (let i = 0; i < members.length; i += 5) {
                const batch = members.slice(i, i + 5);
                await Promise.all(batch.map(async (m) => {
                    try {
                        const logRes = await fetchWithRotation(`/players/${encodeURIComponent(m.tag)}/battlelog`);
                        if (logRes.ok) {
                            const logData = await logRes.json();
                            await supabase.rpc('ingest_player_battles', { 
                                p_tag: m.tag, 
                                p_payload: logData 
                            });
                        }
                    } catch (e) { /* Individual fail silent */ }
                }));
            }
            results.battles = true;
        }
    } catch (e) { console.error('[v18.1.0] S5 Deep Depth Failed:', e.message); }

    return new Response(JSON.stringify({
      success: true,
      version: '12.2.0',
      pipeline: results,
      ingested_at: new Date().toISOString()
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error(`[CRITICAL] Ingestion Pipeline Failed: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
