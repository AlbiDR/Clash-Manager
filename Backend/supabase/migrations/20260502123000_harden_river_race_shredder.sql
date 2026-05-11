-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [ARCHITECTURAL HARMONIZATION]
-- Rationale: Hardens the River Race shredder to prevent unintended member reactivation.
-- The Roster Sync (shred_clan_members) is the authoritative source for member status.
-- shred_river_race should only satisfy foreign keys and update metrics, without overriding the is_active flag.

CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS TRIGGER AS $$
DECLARE
    current_season_id TEXT;
    target_week_id TEXT;
    v_clan_tag TEXT;
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
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT p->>'tag', p->>'name'
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. Ensure members exist (L2 Members) - Lazy creation to satisfy FK
    -- HARMONIZATION FIX: Default is_active to FALSE. Roster Sync will toggle it TRUE if they are actually in the clan.
    INSERT INTO drivers.members (player_tag, player_name, current_clan_tag, is_active, last_ingested_at)
    SELECT p->>'tag', p->>'name', v_clan_tag, FALSE, now()
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        current_clan_tag = EXCLUDED.current_clan_tag,
        -- is_active = EXCLUDED.is_active, -- REMOVED: Do not override active status here
        last_ingested_at = EXCLUDED.last_ingested_at,
        updated_at = now();

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
            p->>'tag'              AS p_tag,
            (p->>'fame')::INT      AS p_fame,
            (p->>'decksUsed')::INT AS p_decks_used,
            (p->>'decksUsedToday')::INT AS p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
