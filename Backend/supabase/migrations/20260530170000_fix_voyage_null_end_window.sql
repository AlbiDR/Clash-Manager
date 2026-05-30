-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530170000_fix_voyage_null_end_window
 * -----------------------------------------------------
 * Root Cause:
 *   drivers.refresh_voyage_contributions() binds the battle time window with
 *   "b.battle_time <= v_end". Under the two-phase auto-activation model
 *   (20260529220000), a voyage is promoted from PENDING to ACTIVE by pg_cron
 *   while end_at is still NULL. NULL used in a comparison always evaluates to
 *   NULL (never TRUE), so the INSERT selects zero battles and the contribution
 *   table remains empty. Progress stays frozen at 0 crowns until end_at is
 *   explicitly set, which could be hours later.
 *
 * Fix:
 *   Replace the hard v_end bound with COALESCE(v_end, now()) so that, while
 *   no end time has been recorded yet, all battles up to the current moment
 *   are included. Once end_at is set by the admin the behaviour is identical
 *   to before.
 *
 * Scope:
 *   1. drivers.refresh_voyage_contributions -- the periodic/manual recompute path.
 *   2. drivers.on_battle_recorded          -- the real-time insert trigger, which
 *      had the same NULL-guard omission: "v.end_at >= NEW.battle_time" always
 *      evaluates to NULL when end_at is NULL, so live battles were silently
 *      dropped from contributions during the awaiting-end window.
 */

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
    v_window_end TIMESTAMPTZ;
BEGIN
    SELECT id, start_at, end_at, target_crowns
    INTO v_id, v_start, v_end, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN RETURN; END IF;

    -- When end_at has not been set yet (two-phase auto-activation model),
    -- treat the upper window bound as the current moment so that battles
    -- recorded since activation are counted immediately.
    v_window_end := COALESCE(v_end, now());

    -- 1. Remove ghost records of players not in the current roster
    --    who have no manual override worth preserving
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND COALESCE(manual_crowns, 0) = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members);

    -- 2. Reset crowns to just their manual override amount (clearing old automated sums)
    UPDATE drivers.clan_voyage_contributions
    SET crowns = COALESCE(manual_crowns, 0)
    WHERE voyage_id = v_id;

    -- 3. Upsert automated sums using an ALLOWLIST of competitive battle types:
    --    PvP            - regular multiplayer home village attacks
    --    pathOfLegend   - Legend League home village attacks
    --    riverRacePvP   - Clan War League river race battles
    --    riverRaceDuel  - Clan War League river race duels
    --
    --    Excluded: boatBattle (Builder Base), trail (Goblin Map/single-player),
    --              friendly, clanMate, clanMate2v2, tournament
    INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_pct)
    SELECT
        v_id,
        b.player_tag,
        m.player_name,
        SUM(b.team_crowns) AS crowns,
        LEAST(ROUND((SUM(b.team_crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0) AS voyage_crown_pct
    FROM drivers.player_battles b
    INNER JOIN drivers.members m ON m.player_tag = b.player_tag
    WHERE b.battle_time >= v_start AND b.battle_time <= v_window_end
      AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
    GROUP BY b.player_tag, m.player_name
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        player_name = excluded.player_name,
        crowns = excluded.crowns + COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0),
        voyage_crown_pct = LEAST(ROUND(((excluded.crowns + COALESCE(drivers.clan_voyage_contributions.manual_crowns, 0))::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
        updated_at = NOW();

    -- 4. Final pass: ensure all percentages are accurate
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_pct = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

-- ============================================================
-- Fix 2: drivers.on_battle_recorded (real-time insert trigger)
-- ============================================================
-- The trigger matched an ACTIVE voyage with:
--   AND v.end_at >= NEW.battle_time
-- When end_at is NULL this predicate is always NULL (not TRUE),
-- so every incoming battle was silently ignored. Replace the hard
-- bound with COALESCE(v.end_at, 'infinity'::timestamptz) to keep
-- the window open until an explicit end time is recorded.
CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_id     BIGINT;
    v_target INT;
    v_current INT;
    v_end    TIMESTAMPTZ;
BEGIN
    SELECT v.id, v.target_crowns, v.end_at
    INTO v_id, v_target, v_end
    FROM drivers.clan_voyage v
    WHERE v.status = 'ACTIVE'
      AND v.start_at <= NEW.battle_time
      AND COALESCE(v.end_at, 'infinity'::timestamptz) >= NEW.battle_time
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, crowns)
        VALUES (v_id, NEW.player_tag, NEW.team_crowns)
        ON CONFLICT (voyage_id, player_tag)
        DO UPDATE SET
            crowns     = drivers.clan_voyage_contributions.crowns + EXCLUDED.crowns,
            updated_at = now();

        SELECT SUM(crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        -- Auto-complete when goal is reached or the event window has closed.
        -- end_at may still be NULL here; only the crown ceiling triggers completion
        -- in that case (time-based completion is deferred until end_at is set).
        IF v_current >= v_target OR (v_end IS NOT NULL AND now() >= v_end) THEN
            UPDATE drivers.clan_voyage
            SET status     = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    ELSE
        -- Finalise any voyage whose explicit end_at has passed.
        UPDATE drivers.clan_voyage
        SET status     = 'COMPLETED',
            updated_at = now()
        WHERE status = 'ACTIVE'
          AND end_at IS NOT NULL
          AND end_at <= now();
    END IF;

    RETURN NEW;
END;
$$;
