-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [ARCHITECTURAL HARMONIZATION]
-- Rationale: Ensures that recruits who join the clan are automatically transitioned out of the recruitment pool.
-- This prevents "Ghost Recruits" from appearing in the Headhunter view once they are already active members.

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_clan_tag TEXT;
    v_recruit_tag TEXT;
BEGIN
    -- Identify the target clan
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- 1. UPSERT participants into universal players registry first to satisfy FKs
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT 
        m->>'tag', 
        m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. UPSERT current members into drivers.members
    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies, 
        donations, donations_received, clan_rank, last_seen_at, 
        last_ingested_at, is_active, updated_at, current_clan_tag
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
        now(),
        v_clan_tag
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
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
        current_clan_tag = EXCLUDED.current_clan_tag,
        updated_at = now();

    -- 3. DEACTIVATE LEAVERS
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND current_clan_tag = v_clan_tag
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM jsonb_array_elements(NEW.payload->'items') AS elem
      );

    -- 4. CLEANUP RECRUITS (Harmonization)
    -- If an active member is found in the recruits table, they have "joined us".
    -- We delete them from the active recruitment pool and log the event.
    FOR v_recruit_tag IN 
        SELECT r.player_tag 
        FROM drivers.recruits r
        JOIN jsonb_array_elements(NEW.payload->'items') AS m ON (m->>'tag' = r.player_tag)
    LOOP
        -- Log the transition
        INSERT INTO drivers.recruit_ledger (player_tag, event_type, description)
        VALUES (v_recruit_tag, 'JOINED_US', 'Recruit detected in active roster payload.');

        -- Delete from recruits
        DELETE FROM drivers.recruits WHERE player_tag = v_recruit_tag;
    END LOOP;

    RETURN NEW;
END; $function$;
