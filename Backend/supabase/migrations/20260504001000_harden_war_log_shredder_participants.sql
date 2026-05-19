-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: Harden War Log Shredder for Participant History
-- Rationale:
-- 1. Extend shred_war_log to extract player participants from historical river race logs.
-- 2. Ensure players and members exist (lazy creation) to satisfy foreign key constraints.
-- 3. Enables immediate population of 12-week history upon a single war log ingestion.

BEGIN;

CREATE OR REPLACE FUNCTION substrate.shred_war_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_item JSONB;
    v_standing JSONB;
    v_participant JSONB;
    v_week_id TEXT;
BEGIN
    -- 1. Update Clan History (Standings) for all clans in the log
    -- This provides benchmarking data for opponents.
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

    -- 2. Extract and Shred Participants for the targeted clan
    -- We loop through items to ensure we handle the nested structure correctly and satisfy FKs
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.payload->'items')
    LOOP
        v_week_id := (v_item->>'seasonId') || '-' || (v_item->>'sectionIndex');
        
        FOR v_standing IN SELECT * FROM jsonb_array_elements(v_item->'standings')
        LOOP
            -- Only process participants for the clan that owns this log entry
            IF (v_standing->'clan'->>'tag') = NEW.clan_tag THEN
                
                -- A. Ensure players exist in universal registry
                INSERT INTO drivers.players (player_tag, player_name)
                SELECT p->>'tag', p->>'name'
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    updated_at  = now();

                -- B. Ensure members exist (Lazy creation to satisfy war_activity FK)
                -- We set is_active to FALSE by default; the roster sync will set it TRUE if they are currently in the clan.
                INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
                SELECT p->>'tag', p->>'name', NEW.clan_tag, FALSE, now()
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    updated_at = now();

                -- C. Upsert War Activity
                INSERT INTO drivers.war_activity (
                    player_tag, player_name, week_id, section_index,
                    decks_used, fame
                )
                SELECT
                    p->>'tag',
                    p->>'name',
                    v_week_id,
                    (v_item->>'sectionIndex')::INTEGER,
                    (p->>'decksUsed')::INTEGER,
                    (p->>'fame')::INTEGER
                FROM jsonb_array_elements(v_standing->'clan'->'participants') p
                ON CONFLICT (player_tag, week_id) DO UPDATE SET
                    player_name = EXCLUDED.player_name,
                    decks_used  = EXCLUDED.decks_used,
                    fame        = EXCLUDED.fame,
                    updated_at  = NOW();
            END IF;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$function$;

COMMIT;
