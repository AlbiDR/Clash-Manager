-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Optimize Voyage Contributions Pipeline
 *
 * Rationale:
 * - transition to Lazy Insertion model during active events to prevent storage bloat.
 * - Guard triggers and RPC overrides to prevent non-member or NULL name ingestion.
 * - One-time smart finalization to populate 0-crown rows for roster members upon voyage completion.
 * - Historical data clean sweep to purge corrupted non-member or 0-crown records.
 */

BEGIN;

-- 1. Clean up corrupted historical records first to ensure a healthy schema state
DELETE FROM drivers.clan_voyage_contributions
WHERE player_tag NOT IN (SELECT player_tag FROM drivers.members);

DELETE FROM drivers.clan_voyage_contributions
WHERE crowns = 0
  AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

UPDATE drivers.clan_voyage_contributions c
SET player_name = m.player_name
FROM drivers.members m
WHERE c.player_tag = m.player_tag
  AND (c.player_name IS NULL OR c.player_name <> m.player_name);

-- 2. REBUILD: drivers.on_battle_recorded Trigger Function
CREATE OR REPLACE FUNCTION drivers.on_battle_recorded()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INT;
    v_current INT;
    v_end     TIMESTAMPTZ;
    v_name    TEXT;
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
            INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_percentage)
            VALUES (
                v_id,
                NEW.player_tag,
                v_name,
                NEW.team_crowns,
                LEAST(ROUND((NEW.team_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
            )
            ON CONFLICT (voyage_id, player_tag)
            DO UPDATE SET 
                crowns = drivers.clan_voyage_contributions.crowns + EXCLUDED.crowns,
                voyage_crown_percentage = LEAST(ROUND(((drivers.clan_voyage_contributions.crowns + EXCLUDED.crowns)::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0),
                player_name = v_name,
                updated_at = now();
        END IF;

        SELECT SUM(crowns) INTO v_current
        FROM drivers.clan_voyage_contributions
        WHERE voyage_id = v_id;

        IF v_current >= v_target OR now() >= v_end THEN
            UPDATE drivers.clan_voyage
            SET status = 'COMPLETED',
                updated_at = now()
            WHERE id = v_id;
        END IF;
    ELSE
        UPDATE drivers.clan_voyage
        SET status = 'COMPLETED',
            updated_at = now()
        WHERE status = 'ACTIVE'
        AND end_at <= now();
    END IF;

    RETURN NEW;
END;
$$;

-- 3. REBUILD: drivers.refresh_voyage_contributions
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

    -- 1. Strict Pruning: Remove any contribution records for players who are not currently active clan members
    DELETE FROM drivers.clan_voyage_contributions
    WHERE voyage_id = v_id
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    -- 2. Calculate and update the correct live scores.
    --    We perform this in a clean UPDATE pass that handles both players with and without overrides.
    UPDATE drivers.clan_voyage_contributions c
    SET
        crowns = COALESCE(c.total_crowns, 0) + COALESCE((
            SELECT SUM(b.team_crowns)
            FROM drivers.player_battles b
            WHERE b.player_tag = c.player_tag
              AND b.battle_time <= v_window_end
              AND b.battle_type IN ('PvP', 'pathOfLegend', 'riverRacePvP', 'riverRaceDuel')
              AND (
                  -- If there's a manual override, only count subsequent battles
                  (c.total_crowns IS NOT NULL AND b.battle_time > c.total_crowns_at)
                  OR
                  -- Otherwise, count everything since voyage start
                  (c.total_crowns IS NULL AND b.battle_time >= v_start)
              )
        ), 0),
        updated_at = now()
    WHERE c.voyage_id = v_id;

    -- 3. Final pass: ensure all percentages are accurate.
    UPDATE drivers.clan_voyage_contributions
    SET voyage_crown_percentage = LEAST(ROUND((crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    WHERE voyage_id = v_id;

END;
$function$;

-- 4. REBUILD: drivers.set_voyage_total_crowns
CREATE OR REPLACE FUNCTION drivers.set_voyage_total_crowns(
    p_player_tag TEXT,
    p_crowns     INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    v_id      BIGINT;
    v_target  INTEGER;
    v_name    TEXT;
    v_now     TIMESTAMP WITH TIME ZONE := now();
BEGIN
    SELECT id, target_crowns
    INTO v_id, v_target
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'No ACTIVE clan voyage found.'
        );
    END IF;

    IF p_crowns < 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'crowns must be non-negative.'
        );
    END IF;

    -- Strict Guard: Only active clan members can have manual overrides
    SELECT player_name INTO v_name
    FROM drivers.members
    WHERE player_tag = p_player_tag
      AND is_active = true
    LIMIT 1;

    IF v_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Player is not an active clan member.'
        );
    END IF;

    INSERT INTO drivers.clan_voyage_contributions
        (voyage_id, player_tag, player_name, total_crowns, total_crowns_at, crowns, voyage_crown_percentage)
    VALUES (
        v_id,
        p_player_tag,
        v_name,
        p_crowns,
        v_now,
        p_crowns,
        LEAST(ROUND((p_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
    )
    ON CONFLICT (voyage_id, player_tag) DO UPDATE
    SET
        total_crowns    = EXCLUDED.total_crowns,
        total_crowns_at = EXCLUDED.total_crowns_at,
        crowns           = EXCLUDED.crowns,
        voyage_crown_percentage = EXCLUDED.voyage_crown_percentage,
        updated_at       = v_now;

    PERFORM drivers.refresh_voyage_contributions();

    RETURN jsonb_build_object(
        'success',    true,
        'voyage_id',  v_id,
        'player_tag', p_player_tag,
        'crowns',     p_crowns
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. REBUILD: substrate.finalize_expired_voyages
CREATE OR REPLACE FUNCTION substrate.finalize_expired_voyages()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
    v_rec   RECORD;
BEGIN
    -- For each voyage that is about to be auto-finalized
    FOR v_rec IN (
        SELECT id, target_crowns 
        FROM drivers.clan_voyage 
        WHERE status = 'ACTIVE' AND end_at <= now()
    ) LOOP
        -- 1. One-time pre-population of 0-crown rows for all active members who did not participate
        INSERT INTO drivers.clan_voyage_contributions (voyage_id, player_tag, player_name, crowns, voyage_crown_percentage)
        SELECT 
            v_rec.id, 
            m.player_tag, 
            m.player_name, 
            0, 
            0.0
        FROM drivers.members m
        WHERE m.is_active = true
          AND m.player_tag NOT IN (
              SELECT player_tag FROM drivers.clan_voyage_contributions WHERE voyage_id = v_rec.id
          )
        ON CONFLICT (voyage_id, player_tag) DO NOTHING;
    END LOOP;

    -- 2. Transition voyages to COMPLETED
    UPDATE drivers.clan_voyage
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE status = 'ACTIVE'
    AND end_at <= now();
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 3. Clean up the database: prune any 0-crown contribution records of players who are no longer active
    DELETE FROM drivers.clan_voyage_contributions
    WHERE crowns = 0
      AND (
          player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true)
          OR player_name IS NULL
      );

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('VOYAGE_FINALIZATION', 'SUCCESS', 'Auto-finalized ' || v_count || ' expired Clan Voyages.');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
