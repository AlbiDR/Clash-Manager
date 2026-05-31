-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Add UI Manual Override Trigger
 *
 * Rationale:
 *   - When manual_voyage_crowns is edited directly in the database (e.g. via Supabase Table Editor),
 *     automatically set manual_voyage_crowns_at, update total_voyage_crowns (adding subsequent battles),
 *     and recalculate percentage_voyage_crowns.
 */

BEGIN;

CREATE OR REPLACE FUNCTION drivers.on_contribution_manual_override_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = NEW.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
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
$$;

DROP TRIGGER IF EXISTS trg_on_contribution_manual_override_updated ON drivers.clan_voyage_contributions;

CREATE TRIGGER trg_on_contribution_manual_override_updated
BEFORE UPDATE OF manual_voyage_crowns ON drivers.clan_voyage_contributions
FOR EACH ROW
EXECUTE FUNCTION drivers.on_contribution_manual_override_updated();

COMMIT;
