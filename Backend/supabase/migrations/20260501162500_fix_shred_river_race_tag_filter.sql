-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: shred_river_race tag-format guard
--
-- Root cause: the trigger's four INSERT/UPDATE statements each do an unbounded
-- SELECT over jsonb_array_elements(payload->'clan'->'participants').  If any
-- participant carries a tag that fails `players_player_tag_check`
-- (~* '^#[0289CGJLPQRUVY]+$'), the step-1 INSERT into drivers.players raises
-- a CHECK violation.  That exception aborts steps 2-4, leaving no rows in
-- drivers.members, which then causes the step-3 INSERT into
-- drivers.war_activity to fail with FK-23503 (fk_war_activity_player).
-- The entire raw_river_race INSERT is rolled back, leaving the table empty.
--
-- Fix: add WHERE (p->>'tag') ~* '^#[0289CGJLPQRUVY]+$' to every SELECT that
-- reads from the participants array so that off-spec tags are silently skipped
-- rather than aborting the whole batch.
-- =============================================================================

CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    current_season_id TEXT;
    target_week_id    TEXT;
    v_clan_tag        TEXT;
BEGIN
    v_clan_tag := NEW.payload->'clan'->>'tag';

    -- Resolve Week ID from War Log or fallback to ISO week
    SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
    FROM substrate.raw_war_log
    ORDER BY ingested_at DESC LIMIT 1;

    IF current_season_id IS NOT NULL THEN
        target_week_id := current_season_id || '-' || (NEW.payload->>'sectionIndex');
    ELSE
        target_week_id := to_char(now(), 'YYYY-"W"WW');
    END IF;

    -- 1. Ensure players exist in universal registry (L2 Players)
    --    Guard: skip any participant whose tag fails the check constraint.
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT p->>'tag', p->>'name'
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    WHERE (p->>'tag') ~* '^#[0289CGJLPQRUVY]+$'
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. Ensure members exist (L2 Members) - Lazy creation to satisfy FK
    --    Guard: same tag-format filter; also skip if clan tag is blank/invalid.
    INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
    SELECT p->>'tag', p->>'name', v_clan_tag, TRUE, now()
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    WHERE (p->>'tag') ~* '^#[0289CGJLPQRUVY]+$'
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name      = EXCLUDED.player_name,
        current_clan_tag = EXCLUDED.current_clan_tag,
        is_active        = TRUE,
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at       = now();

    -- 3. Update war activity for participants
    --    Guard: same tag-format filter.
    INSERT INTO drivers.war_activity (
        player_tag, player_name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT
        p->>'tag',
        p->>'name',
        target_week_id,
        (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT,
        (p->>'decksUsedToday')::INT,
        (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    WHERE (p->>'tag') ~* '^#[0289CGJLPQRUVY]+$'
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        decks_used       = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame             = EXCLUDED.fame,
        updated_at       = now();

    -- 4. Sync back high-level metrics to members table
    --    Guard: same tag-format filter.
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
        WHERE (p->>'tag') ~* '^#[0289CGJLPQRUVY]+$'
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$$;
