// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as v from "https://esm.sh/valibot@1.4.2";

const RoyaleBattleLogSchema = v.array(
  v.object({
    battleTime: v.string(),
    type: v.string(),
    team: v.array(
      v.object({
        tag: v.string(),
        name: v.string(),
        crowns: v.optional(v.number()),
      })
    ),
    opponent: v.array(
      v.object({
        tag: v.optional(v.string()),
        name: v.optional(v.string()),
        crowns: v.optional(v.number()),
        clan: v.optional(
          v.nullable(
            v.object({
              tag: v.optional(v.string()),
              name: v.optional(v.string()),
            })
          )
        ),
      })
    ),
  })
);

async function main() {
  const playerTag = Deno.args[0];
  if (!playerTag) {
    console.error("Usage: Deno run -A fetch_player_battles.ts <PLAYER_TAG>");
    console.error("Example: Deno run -A fetch_player_battles.ts #PP80QG99");
    Deno.exit(1);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    Deno.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Load API keys from Supabase Vault (either using the RPC or direct environment variable fallback)
  let rawSecret = Deno.env.get("ROYALE_API_KEYS") || "";
  if (!rawSecret) {
    const { data, error: vaultError } = await supabase.rpc('get_vault_secret', { p_name: 'ROYALE_API_KEYS' });
    if (vaultError) {
      console.warn(`[Vault Warning] Failed to retrieve secret from vault: ${vaultError.message}`);
    } else if (data) {
      rawSecret = data;
    }
  }

  if (!rawSecret) {
    console.error("Error: ROYALE_API_KEYS must be set in the environment variables (e.g. via local run) or available in the Vault.");
    Deno.exit(1);
  }

  let keys: string[] = [];
  try {
    const parsed = JSON.parse(rawSecret);
    keys = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    keys = rawSecret.split(",").map((k: string) => k.trim()).filter(Boolean);
  }

  if (keys.length === 0) {
    console.error("Error: No API keys found.");
    Deno.exit(1);
  }

  const normalizedTag = playerTag.startsWith('#') ? playerTag : `#${playerTag}`;
  const encodedTag = encodeURIComponent(normalizedTag);
  const targetKey = keys[Math.floor(Math.random() * keys.length)].trim().replace(/^"|"$/g, "");

  console.log(`Fetching battle log for ${normalizedTag} using API proxy...`);
  const response = await fetch(`https://proxy.royaleapi.dev/v1/players/${encodedTag}/battlelog`, {
    headers: {
      Authorization: `Bearer ${targetKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Royale API Error: ${response.status} - ${errorText}`);
    Deno.exit(1);
  }

  const rawJson: unknown = await response.json();
  const validation = v.safeParse(RoyaleBattleLogSchema, rawJson);

  if (!validation.success) {
    console.error("Validation failed! Clash Royale API returned unexpected format:");
    console.error(validation.issues);
    Deno.exit(1);
  }

  console.log(`Validation successful. Ingesting ${validation.output.length} battles...`);

  // Call the database function to ingest player battles
  const { data, error: ingestError } = await supabase.rpc('ingest_player_battles', {
    p_tag: normalizedTag,
    p_payload: validation.output
  });

  if (ingestError) {
    console.error("Database ingestion RPC failed:", ingestError.message);
    Deno.exit(1);
  }

  console.log("Success! Player battles successfully synced to database.");
}

await main();
