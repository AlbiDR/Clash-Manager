-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530199000_add_colosseum_duels_to_voyage
 * ------------------------------------------------------
 * Purpose: Update refresh_voyage_contributions to include the newly identified
 * 'riverRaceDuelColosseum' battle type, ensuring Colosseum-week CW battles
 * are fully tracked and counted towards the voyage.
 */

CREATE OR REPLACE FUNCTION drivers.refresh_voyage_contributions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'drivers', 'public'
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
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        m.player_tag,
        m.player_name,
        0,
        0.0
    FROM drivers.members m
    WHERE m.player_tag NOT IN (
        SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id
    )
    ON CONFLICT (voyage_id, player_tag) DO NOTHING;

    UPDATE drivers.clan_voyage_contributions c
    SET
        crowns = COALESCE(c.manual_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              -- Include riverRaceDuelColosseum alongside PvP, pathOfLegend, riverRacePvP, and riverRaceDuel
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'riverRaceDuelColosseum')
              AND (
                  (c.manual_crowns IS NOT NULL AND b.battle_time > c.manual_crowns_at)
                  OR
                  (c.manual_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    UPDATE drivers.clan_voyage_contributions SET voyage_crown_pct = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) WHERE voyage_id = v_id;

END;
$function$;
