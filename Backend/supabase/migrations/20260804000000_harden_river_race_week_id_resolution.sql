-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Migration: Harden week_id resolution in substrate.shred_river_race()
--
-- Problem:
--   The previous implementation resolved the war season identifier (week_id) by
--   querying substrate.raw_war_log for the most recent completed-war seasonId.
--   At the very start of a new season, before any war has finished and therefore
--   before any row exists in raw_war_log, that query returns NULL and the function
--   fell back to an ISO calendar week string (e.g. "2026-W31").
--
--   When the war later completed and shred_war_log() ran, it wrote war_activity
--   rows using the real canonial format ("<seasonId>-<sectionIndex>", e.g. "1234-3").
--   The ON CONFLICT (player_tag, week_id) key did not match the ISO-week rows
--   written during the live race, producing duplicate ghost rows.
--
-- Fix:
--   Introduce a three-tier resolution priority for week_id:
--     1. Primary  -- Read seasonId directly from NEW.payload (the live race JSON
--                    itself). The /currentriverrace API exposes seasonId at the
--                    top level on every response, so this eliminates the cross-
--                    table lookup for the common case.
--     2. Secondary -- Fall back to the latest completed war's seasonId stored in
--                    raw_war_log. Preserves the existing behaviour for any edge
--                    case where seasonId is absent from the live payload.
--     3. Last resort -- ISO calendar week. Only fires when both tier-1 and tier-2
--                    sources are unavailable (e.g. training-day period with no
--                    prior war history at all).
--
-- Safety:
--   All downstream logic (player upserts, member upserts, war_activity upsert,
--   member metric sync) is unchanged. The DECLARE block receives one additional
--   variable (v_live_season_id). The ON CONFLICT clauses and table columns are
--   not altered by this migration.

CREATE OR REPLACE FUNCTION substrate.shred_river_race()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_live_season_id   TEXT;
    current_season_id  TEXT;
    target_week_id     TEXT;
    v_clan_tag         TEXT;
BEGIN
    v_clan_tag := NEW.payload->'clan'->>'tag';

    -- Tier 1: Read seasonId directly from the live race payload.
    -- The /currentriverrace API returns seasonId at the top level on every
    -- active-war response. Using this as the primary source guarantees the
    -- week_id format matches what shred_war_log() will produce once the war
    -- ends, eliminating the ghost-row risk at season boundaries.
    v_live_season_id := NEW.payload->>'seasonId';

    IF v_live_season_id IS NOT NULL THEN
        target_week_id := v_live_season_id || '-' || (NEW.payload->>'sectionIndex');

    ELSE
        -- Tier 2 (existing logic): Fall back to the most recently ingested
        -- completed war's seasonId from raw_war_log.
        -- [THREAT:] Cross-table read introduces a dependency on ingestion order.
        -- Acceptable because this path only fires when seasonId is absent from
        -- the live payload (e.g. training-day warm-up state, or an unexpected
        -- API response shape change).
        SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
        FROM substrate.raw_war_log
        ORDER BY ingested_at DESC LIMIT 1;

        IF current_season_id IS NOT NULL THEN
            target_week_id := current_season_id || '-' || (NEW.payload->>'sectionIndex');

        ELSE
            -- Tier 3 (last resort): ISO calendar week.
            -- Only reached when no war has ever completed in this database
            -- instance and the live payload also lacks a seasonId.
            -- [THREAT:] Produces a week_id that will not match the canonical
            -- format once the first war completes. Acceptable as a safety net
            -- for edge-case cold starts; the conflict key ensures no real data
            -- is lost -- a new row is simply inserted under a transient key.
            target_week_id := to_char(now(), 'YYYY-"W"WW');

        END IF;
    END IF;

    -- 1. Ensure players exist in universal registry (L2 Players)
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT p->>'tag', p->>'name'
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. Ensure members exist (L2 Members) - Lazy creation to satisfy FK
    -- Default is_active to FALSE. Roster Sync will toggle it TRUE if they are
    -- actually in the clan.
    INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
    SELECT p->>'tag', p->>'name', v_clan_tag, FALSE, now()
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name      = EXCLUDED.player_name,
        current_clan_tag = EXCLUDED.current_clan_tag,
        -- is_active = EXCLUDED.is_active, -- REMOVED: Do not override active status here
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at       = now();

    -- 3. Update war activity for participants
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

    -- 4. Sync back high-level metrics to members table
    UPDATE drivers.members m
    SET
        decks_used_today  = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame         = p.p_fame,
        current_clan_tag  = v_clan_tag,
        last_ingested_at  = now()
    FROM (
        SELECT
            p->>'tag'                   AS p_tag,
            (p->>'fame')::INT           AS p_fame,
            (p->>'decksUsed')::INT      AS p_decks_used,
            (p->>'decksUsedToday')::INT AS p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$function$;
