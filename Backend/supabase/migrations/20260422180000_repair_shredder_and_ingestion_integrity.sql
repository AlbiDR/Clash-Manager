-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- INGESTION INTEGRITY REPAIR: Shredder & Clan Tag Resolution
-- Resolves the issue where NULL clan_tags in raw_clan_members caused 
-- total roster deactivation.
-- =============================================================================

-- 1. DATA REPAIR: Populate missing clan_tags for historical integrity.
-- We assume all current historical records in this system belong to the primary clan.
UPDATE substrate.raw_clan_members
SET clan_tag = (SELECT clan_tag FROM drivers.clans LIMIT 1)
WHERE clan_tag IS NULL;

-- 2. HARDEN SHREDDER: Implement defensive fallback for clan_tag resolution.
-- This ensures that even if the ingestion layer fails to provide a clan_tag, 
-- the deactivation logic still finds relevant historical records for comparison.
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    -- A. Resolve context (Fallback to the only known clan if missing)
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
    -- Defensive change: Use COALESCE on rcm.clan_tag to ensure comparison works even with NULLs.
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM substrate.raw_clan_members rcm,
               jsonb_array_elements(rcm.payload->'items') AS elem
          WHERE COALESCE(rcm.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1)) = v_clan_tag
            AND rcm.ingested_at >= (now() - INTERVAL '2 hours')
      );

    RETURN NEW;
END; $function$;

-- 3. RE-ACTIVATE CURRENT MEMBERS (Recovery Phase)
-- Since the previous failure deactivated everyone, we re-activate them based on the last valid payload.
UPDATE drivers.members
SET is_active = TRUE, updated_at = now()
WHERE player_tag IN (
    SELECT (elem->>'tag')::TEXT
    FROM substrate.raw_clan_members rcm,
         jsonb_array_elements(rcm.payload->'items') AS elem
    WHERE rcm.id = (SELECT MAX(id) FROM substrate.raw_clan_members)
);
