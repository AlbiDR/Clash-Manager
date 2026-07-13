-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MIGRATION: Fix riverRaceDuel crown calculation in Clan Voyage
-- =============================================================================
--
-- PROBLEM:
--   For regular 1v1 battles, voyage crowns are calculated as `team_crowns + (3 - opponent_crowns)`.
--   For `riverRaceDuel` (best-of-3), the API returns cumulative crowns across all sub-battles
--   in `team_crowns`. Applying the `(3 - opponent_crowns)` bonus incorrectly assumes a single
--   game was played, leading to incorrect calculations.
--
-- FIX:
--   Use a CASE statement to calculate crowns:
--   - For `riverRaceDuel`, use `team_crowns` directly.
--   - For other battle types, use `team_crowns + (3 - opponent_crowns)`.
--   Updated `refresh_voyage_contributions`, `on_contribution_manual_override_updated`,
--   and `on_battle_recorded` to use this logic consistently.
-- =============================================================================

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
            SELECT SUM(
                CASE 
                    WHEN b.battle_type = 'riverRaceDuel' THEN b.team_crowns
                    ELSE b.team_crowns + (3 - b.opponent_crowns)
                END
            )
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
            SELECT SUM(
                CASE 
                    WHEN b.battle_type = 'riverRaceDuel' THEN b.team_crowns
                    ELSE b.team_crowns + (3 - b.opponent_crowns)
                END
            )
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

CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_id      BIGINT;
    v_target  INT;
    v_current INT;
    v_end     TIMESTAMPTZ;
    v_name    TEXT;
    v_earned  INT;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
    AND v.start_at <= NEW.battle_time
    AND v.end_at >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        -- Only record voyage contribution if the player is currently an active clan member
        SELECT player_name INTO v_name
        FROM drivers.members
        WHERE player_tag = NEW.player_tag
          AND is_active = true
        LIMIT 1;

        IF v_name IS NOT NULL THEN
            -- Calculate crowns for this battle
            v_earned := CASE 
                WHEN NEW.battle_type = 'riverRaceDuel' THEN NEW.team_crowns
                ELSE NEW.team_crowns + (3 - NEW.opponent_crowns)
            END;

            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            VALUES (
                v_id,
                NEW.player_tag,
                v_name,
                v_earned,
                LEAST(ROUND((v_earned::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
            )
            ON CONFLICT (voyage_id, player_tag)
            DO UPDATE SET
                total_voyage_crowns = drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns,
                percentage_voyage_crowns = LEAST(ROUND(((drivers.clan_voyage_contributions.total_voyage_crowns + EXCLUDED.total_voyage_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
                player_name = v_name,
                updated_at = now();
        END IF;

        SELECT SUM(total_voyage_crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        IF v_current >= v_target OR now() >= v_end THEN
            -- [FIX] Pre-populate 0-crown rows for all non-participating active members
            --       before transitioning to COMPLETED. This ensures every member has a
            --       contribution record (even at 0) so their voyage history is complete.
            INSERT INTO drivers.clan_voyage_contributions (
                voyage_id,
                player_tag,
                player_name,
                total_voyage_crowns,
                percentage_voyage_crowns
            )
            SELECT
                v_id,
                m.player_tag,
                m.player_name,
                0,
                0.0
            FROM drivers.members m
            WHERE m.is_active = true
              AND m.player_tag NOT IN (
                  SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_id
              )
            ON CONFLICT (voyage_id, player_tag) DO NOTHING;

            UPDATE drivers.clan_voyage
            SET status = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    ELSE
        -- Handle the case where the voyage end_at has passed during battle processing.
        -- Delegate to finalize_expired_voyages() which handles 0-crown insertion atomically,
        -- avoiding code duplication and ensuring consistent behaviour.
        PERFORM substrate.finalize_expired_voyages();
    END IF;

    RETURN NEW;
END;
$function$;
