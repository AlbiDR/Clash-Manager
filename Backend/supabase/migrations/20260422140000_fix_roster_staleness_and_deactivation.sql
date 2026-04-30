-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- ROSTER INTEGRITY FIX: Staleness and Deactivation
-- Fixes the "inflated roster" bug where members were never deactivated after leaving.
-- =============================================================================

-- 1. DATA REPAIR: Deactivate everyone not seen in the last 24 hours.
-- This collapses the current 212-row roster down to actual active members.
UPDATE drivers.members
SET is_active = FALSE, updated_at = NOW()
WHERE last_ingested_at < (NOW() - INTERVAL '24 hours')
   OR last_ingested_at IS NULL;

-- 2. REBUILD SHREDDER: Add autonomous deactivation logic to retire leavers.
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    -- A. Resolve context
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- B. UPSERT current members from payload
    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies, 
        donations, donations_received, clan_rank, last_seen_at, 
        last_ingested_at, is_active, updated_at
    )
    SELECT 
        m->>'tag', 
        m->>'name', 
        m->>'role', 
        (m->>'expLevel')::INT, 
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0), 
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'clanRank')::INT, 
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE, 
        now(), 
        TRUE, 
        now()
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name, 
        role = EXCLUDED.role, 
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies, 
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received, 
        clan_rank = EXCLUDED.clan_rank,
        last_seen_at = EXCLUDED.last_seen_at, 
        last_ingested_at = EXCLUDED.last_ingested_at,
        is_active = TRUE,
        updated_at = now();

    -- C. DEACTIVATE LEAVERS
    -- Retire members of this clan who are NOT in any payload ingested in the last 2 hours.
    -- This handles chunked syncs while ensuring leavers are purged once the sync window closes.
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM substrate.raw_clan_members rcm,
               jsonb_array_elements(rcm.payload->'items') AS elem
          WHERE rcm.clan_tag = v_clan_tag
            AND rcm.ingested_at >= (now() - INTERVAL '2 hours')
      );

    RETURN NEW;
END; $function$;

-- 3. REBUILD VIEW: Filter for active members only.
CREATE OR REPLACE VIEW features.roster_view 
WITH (security_invoker = true)
AS
 SELECT player_tag,
    player_name,
    role,
    exp_level,
    trophies,
    donations,
    donations_received,
    clan_rank,
    decks_used_today,
    decks_used_weekly,
    week_fame,
    last_seen_at,
    last_ingested_at,
    substrate.format_last_seen(EXTRACT(epoch FROM (now() - last_seen_at)) / 86400.0) AS last_seen_label,
    substrate.format_last_seen(EXTRACT(epoch FROM (now() - last_ingested_at)) / 86400.0) AS last_ingested_label
   FROM drivers.members m
   WHERE m.is_active = TRUE;
