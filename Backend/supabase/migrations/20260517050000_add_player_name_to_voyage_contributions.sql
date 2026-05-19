-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration to add player_name to clan_voyage_contributions

ALTER TABLE drivers.clan_voyage_contributions ADD COLUMN player_name text;

-- Update existing records
UPDATE drivers.clan_voyage_contributions c
SET player_name = p.player_name
FROM drivers.players p
WHERE c.player_tag = p.player_tag;

-- Replace the refresh_voyage_contributions function to include player_name
CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'drivers', 'public'
AS $function$
DECLARE
    v_id     BIGINT;
    v_start  TIMESTAMPTZ;
    v_end    TIMESTAMPTZ;
    v_target INTEGER;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    -- Clean up stale test data or players who left/have 0 crowns in the exact window
    DELETE FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id;

    -- Re-insert exactly what is in the battle time window
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        b.player_tag,
        p.player_name,
        SUM(b.team_crowns) AS crowns,
        LEAST(ROUND((SUM(b.team_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) AS voyage_crown_pct
    FROM drivers.player_battles b
    LEFT JOIN drivers.players p ON p.player_tag = b.player_tag
    WHERE b.battle_time >= v_start AND b.battle_time <= v_end
    GROUP BY b.player_tag, p.player_name;
END;
$function$;
