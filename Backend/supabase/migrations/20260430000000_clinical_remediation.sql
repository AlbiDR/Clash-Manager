-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [REMEDIATION] Clinical Tag Alignment and Schema Correction
-- This migration fixes inconsistencies found after the unification audit.

BEGIN;

-- 0. Prepare: Drop views that depend on columns being renamed
DROP VIEW IF EXISTS features.war_loyalty_view;

-- 1. Correct drivers.war_history (Stores Clan data, not Player data)
-- First, drop the incorrect foreign key that links clan historical data to a player
ALTER TABLE drivers.war_history DROP CONSTRAINT IF EXISTS fk_war_history_player;

-- Rename columns to reflect reality (Clan data) if they haven't been renamed yet
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'drivers' AND table_name = 'war_history' AND column_name = 'player_tag') THEN
        ALTER TABLE drivers.war_history RENAME COLUMN player_tag TO clan_tag;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'drivers' AND table_name = 'war_history' AND column_name = 'player_name') THEN
        ALTER TABLE drivers.war_history RENAME COLUMN player_name TO clan_name;
    END IF;
END $$;

-- 2. Correct drivers.members (Restore missing current_clan_tag)
ALTER TABLE drivers.members ADD COLUMN IF NOT EXISTS current_clan_tag TEXT;
DO $$ 
BEGIN
    ALTER TABLE drivers.members ADD CONSTRAINT chk_members_current_clan_tag CHECK (current_clan_tag ~ '^#[0289CGJLPQRUVY]+$');
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. Refresh substrate.shred_war_log
CREATE OR REPLACE FUNCTION substrate.shred_war_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
BEGIN
    INSERT INTO drivers.war_history (clan_tag, clan_name, week_id, fame, rank, clan_points)
    SELECT
        (standing->'clan'->>'tag')::TEXT,
        (standing->'clan'->>'name')::TEXT,
        (item->>'seasonId')::TEXT || '-' || (item->>'sectionIndex')::TEXT,
        (standing->'clan'->>'fame')::INTEGER,
        (standing->>'rank')::INTEGER,
        (standing->'clan'->>'clanScore')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE (standing->'clan'->>'tag') IS NOT NULL
    ON CONFLICT (clan_tag, week_id) DO UPDATE SET
        clan_name    = EXCLUDED.clan_name,
        fame         = EXCLUDED.fame,
        rank         = EXCLUDED.rank,
        clan_points  = EXCLUDED.clan_points,
        updated_at   = NOW();

    RETURN NEW;
END;
$function$;

-- 4. Refresh substrate.shred_clan_members
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- UPSERT current members
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

    -- DEACTIVATE LEAVERS
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND current_clan_tag = v_clan_tag
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM substrate.raw_clan_members rcm,
               jsonb_array_elements(rcm.payload->'items') AS elem
          WHERE COALESCE(rcm.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1)) = v_clan_tag
            AND rcm.ingested_at >= (now() - INTERVAL '2 hours')
      );

    RETURN NEW;
END; $function$;

-- 5. Refresh substrate.shred_river_race
CREATE OR REPLACE FUNCTION substrate.shred_river_race()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    current_season_id TEXT;
    target_week_id TEXT;
    v_clan_tag TEXT;
BEGIN
    v_clan_tag := NEW.payload->'clan'->>'tag';

    SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
    FROM substrate.raw_war_log
    ORDER BY ingested_at DESC LIMIT 1;

    IF current_season_id IS NOT NULL THEN
        target_week_id := current_season_id || '-' || (NEW.payload->>'sectionIndex');
    ELSE
        target_week_id := to_char(now(), 'YYYY-"W"WW');
    END IF;

    -- Update war activity for participants
    INSERT INTO drivers.war_activity (
        player_tag, player_name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT
        p->>'tag', p->>'name', target_week_id, (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT, (p->>'decksUsedToday')::INT, (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        decks_used       = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame             = EXCLUDED.fame,
        updated_at       = now();

    -- Sync back to members table
    UPDATE drivers.members m
    SET
        decks_used_today  = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame         = p.p_fame,
        current_clan_tag  = v_clan_tag,
        last_ingested_at  = now()
    FROM (
        SELECT
            p->>'tag'              AS p_tag,
            (p->>'fame')::INT      AS p_fame,
            (p->>'decksUsed')::INT AS p_decks_used,
            (p->>'decksUsedToday')::INT AS p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$function$;

-- 6. Refresh substrate.purge_orphan_players
CREATE OR REPLACE FUNCTION substrate.purge_orphan_players()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    -- Orphan players are those not in members, recruits, or any historical activity
    -- Note: we removed the check on war_history because that table stores clan tags now.
    DELETE FROM drivers.players p 
    WHERE NOT EXISTS (SELECT 1 FROM drivers.members m WHERE m.player_tag = p.player_tag) 
      AND NOT EXISTS (SELECT 1 FROM drivers.recruits r WHERE r.player_tag = p.player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.player_battles b WHERE b.player_tag = p.player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.war_activity wa WHERE wa.player_tag = p.player_tag);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('MAINTENANCE_PURGE', 'INFO', 'Purged ' || v_count || ' orphaned players.');
    END IF;

    RETURN v_count;
END;
$function$;

-- 7. Restore View features.war_loyalty_view
CREATE VIEW features.war_loyalty_view AS
 SELECT clan_tag,
    clan_name,
    week_id,
    fame,
    rank,
    clan_points,
    updated_at
   FROM drivers.war_history wh;

COMMIT;
