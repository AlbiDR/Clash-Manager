-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_id         BIGINT;
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_target     INTEGER;
    v_window_end TIMESTAMPTZ;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    v_window_end := COALESCE(v_end, now());

    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    -- player_battles is a rolling ~100-battle window, so re-deriving a cumulative
    -- total from it can only undercount. Overridden rows stay authoritative.
    UPDATE drivers.clan_voyage_contributions c
    SET
        total_voyage_crowns = CASE
            WHEN c.manual_voyage_crowns IS NOT NULL THEN
                c.manual_voyage_crowns + COALESCE((
                    SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
                    FROM drivers.player_battles b
                    WHERE b.player_tag = c.player_tag
                      AND b.battle_time <= v_window_end
                      AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
                      AND b.battle_time > c.manual_voyage_crowns_at
                ), 0)
            ELSE GREATEST(
                COALESCE(c.total_voyage_crowns, 0),
                COALESCE((
                    SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
                    FROM drivers.player_battles b
                    WHERE b.player_tag = c.player_tag
                      AND b.battle_time <= v_window_end
                      AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
                      AND b.battle_time >= v_start
                ), 0)
            )
        END,
        updated_at = now()
    WHERE c.voyage_id = v_id;

    UPDATE drivers.clan_voyage_contributions
    SET percentage_voyage_crowns = LEAST(ROUND((total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;
