-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. PURGE CLAN NOISE FROM PLAYER REGISTRY
-- This removes any rows where the player_tag is actually a clan_tag.
-- We do this for both drivers.members and drivers.players to maintain FK integrity.

DELETE FROM drivers.members 
WHERE player_tag IN (SELECT clan_tag FROM drivers.clans);

DELETE FROM drivers.players 
WHERE player_tag IN (SELECT clan_tag FROM drivers.clans);


-- 2. REPAIR SHRED_CLAN_PROFILE
-- Implements the missing logic to update the authoritative clans registry.

CREATE OR REPLACE FUNCTION substrate.shred_clan_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
BEGIN
    INSERT INTO drivers.clans (
        clan_tag, clan_name, description, badge_id, 
        member_count, type, required_trophies, war_trophies, 
        last_ingested_at, updated_at
    )
    VALUES (
        NEW.payload->>'tag',
        NEW.payload->>'name',
        NEW.payload->>'description',
        (NEW.payload->>'badgeId')::INT,
        (NEW.payload->>'members')::INT,
        NEW.payload->>'type',
        (NEW.payload->>'requiredTrophies')::INT,
        (NEW.payload->>'clanWarTrophies')::INT,
        now(),
        now()
    )
    ON CONFLICT (clan_tag) DO UPDATE SET
        clan_name = EXCLUDED.clan_name,
        description = EXCLUDED.description,
        badge_id = EXCLUDED.badge_id,
        member_count = EXCLUDED.member_count,
        type = EXCLUDED.type,
        required_trophies = EXCLUDED.required_trophies,
        war_trophies = EXCLUDED.war_trophies,
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END;
$function$;


-- 3. HARDEN SHRED_CLAN_MEMBERS
-- Adds a defensive check to ensure we never ingest a clan tag as a member.

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
    -- Defensive change: filter out any tag that is actually the current clan_tag
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
    WHERE (m->>'tag') != v_clan_tag -- Defensive Guard
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
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM substrate.raw_clan_members rcm,
               jsonb_array_elements(rcm.payload->'items') AS elem
          WHERE COALESCE(rcm.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1)) = v_clan_tag
            AND rcm.ingested_at >= (now() - INTERVAL '2 hours')
      )
      AND player_tag NOT IN (SELECT clan_tag FROM drivers.clans); -- Double-tap safety

    RETURN NEW;
END; $function$;
