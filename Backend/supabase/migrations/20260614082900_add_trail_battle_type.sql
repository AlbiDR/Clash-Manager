-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Update refresh_voyage_contributions to include 'trail' in battle_type IN checks.
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

    -- 1. Strict Pruning: Remove any contribution records for players who are not currently active clan members
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    -- 2. Calculate and update the correct live scores.
    --    We perform this in a clean UPDATE pass that handles both players with and without overrides.
    UPDATE drivers.clan_voyage_contributions c
    SET
        total_voyage_crowns = COALESCE(c.manual_voyage_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
              AND (
                  -- If there's a manual override, only count subsequent battles
                  (c.manual_voyage_crowns IS NOT NULL AND b.battle_time > c.manual_voyage_crowns_at)
                  OR
                  -- Otherwise, count everything since voyage start
                  (c.manual_voyage_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 3. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET percentage_voyage_crowns = LEAST(ROUND((total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

-- Update on_contribution_manual_override_updated to include 'trail' in battle_type IN checks.
CREATE OR REPLACE FUNCTION drivers.on_contribution_manual_override_updated()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_target     INTEGER;
    v_window_end TIMESTAMPTZ;
BEGIN
    IF NEW.manual_voyage_crowns IS DISTINCT FROM OLD.manual_voyage_crowns THEN
        -- 1. Update the timestamp
        IF NEW.manual_voyage_crowns IS NOT NULL THEN
            NEW.manual_voyage_crowns_at := now();
        ELSE
            NEW.manual_voyage_crowns_at := NULL;
        END IF;

        -- 2. Fetch voyage details
        SELECT start_at, end_at, target_crowns
        INTO v_start, v_end, v_target
        FROM drivers.clan_voyage
        WHERE id = NEW.voyage_id;

        v_window_end := COALESCE(v_end, now());

        -- 3. Calculate total voyage crowns and percentage
        NEW.total_voyage_crowns := COALESCE(NEW.manual_voyage_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns + (3 - b.opponent_crowns))
            FROM drivers.player_battles b
            WHERE b.player_tag = NEW.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel', 'trail')
              AND (
                  (NEW.manual_voyage_crowns IS NOT NULL AND b.battle_time > NEW.manual_voyage_crowns_at)
                  OR
                  (NEW.manual_voyage_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0);

        NEW.percentage_voyage_crowns := LEAST(ROUND((NEW.total_voyage_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0);
        NEW.updated_at := now();
    END IF;

    RETURN NEW;
END;
$function$;
