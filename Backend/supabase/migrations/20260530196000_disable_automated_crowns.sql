-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530196000_disable_automated_crowns
 * ---------------------------------------------------
 * Purpose: After applying manual crown overrides, automated battle
 * contributions should no longer be added. This migration replaces the
 * `drivers.refresh_voyage_contributions` function to stop after resetting
 * crowns to the manual values, effectively making the view reflect only the
 * manual overrides.
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

    -- Remove ghost records of players not in the current roster without manual overrides.
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- Reset crowns to manual values (or zero if none).
    UPDATE drivers.clan_voyage_contributions
    SET crowns = COALESCE(manual_crowns, 0)
    WHERE voyage_id = v_id;

    -- No automated upsert – manual overrides are authoritative.
    RETURN;
END;
$function$;
