-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MIGRATION: Fix 0-crown voyage contribution rows for non-participating members
-- =============================================================================
--
-- PROBLEM:
--   Members who did not fight during a completed Clan Voyage had no entry in
--   their bar graph history on the PWA. Their v_hist string showed N-1 entries
--   instead of N (e.g., 2 bars instead of 3).
--
-- ROOT CAUSE:
--   Two interrelated defects in the voyage pipeline:
--
--   1. on_battle_recorded() TRIGGER BUG
--      When a voyage completes because the crown target is reached
--      (v_current >= v_target), the trigger transitions the voyage to COMPLETED
--      directly without pre-populating 0-crown rows for non-participating members.
--      finalize_expired_voyages() is the ONLY function that inserts these rows,
--      but it only processes voyages WHERE status = 'ACTIVE' AND end_at <= now().
--      Since the trigger already set the status to COMPLETED, the cron job silently
--      skips it, leaving non-participants with no contribution record at all.
--
--   2. finalize_expired_voyages() CLEANUP BUG
--      Step 3 deleted 0-crown rows for any player with player_name IS NULL,
--      regardless of whether they were still an active member. This incorrectly
--      purged valid contribution records for active members whose player_name
--      was NULL at finalization time (e.g., during a fresh data ingestion pass).
--
-- FIX:
--   1. Retroactively backfill all missing 0-crown rows for past completed voyages.
--   2. Fix on_battle_recorded() to pre-populate 0-crown rows before completing.
--   3. Fix finalize_expired_voyages() to scope the cleanup strictly to
--      player_tags that are no longer in the active members roster.
-- =============================================================================

-- =============================================================================
-- STEP 1: Retroactive backfill for all completed voyages
-- =============================================================================
-- Insert 0-crown rows for every active member who has no contribution record
-- for any completed voyage. ON CONFLICT ensures idempotency.
INSERT INTO drivers.clan_voyage_contributions (
    voyage_id,
    player_tag,
    player_name,
    total_voyage_crowns,
    percentage_voyage_crowns
)
SELECT
    v.id,
    m.player_tag,
    m.player_name,
    0,
    0.0
FROM drivers.clan_voyage v
CROSS JOIN drivers.members m
WHERE v.status = 'COMPLETED'
  AND m.is_active = true
  AND NOT EXISTS (
      SELECT 1
      FROM drivers.clan_voyage_contributions c
      WHERE c.voyage_id = v.id
        AND c.player_tag = m.player_tag
  )
ON CONFLICT (voyage_id, player_tag) DO NOTHING;

-- =============================================================================
-- STEP 2: Fix finalize_expired_voyages() - tighten the cleanup condition
-- =============================================================================
-- Remove the OR player_name IS NULL clause which incorrectly purged valid
-- 0-crown records for active members with a temporarily-NULL player_name.
-- The cleanup is now scoped exclusively to player_tags no longer on the roster.
CREATE OR REPLACE FUNCTION substrate.finalize_expired_voyages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
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
        INSERT INTO drivers.clan_voyage_contributions (
            voyage_id,
            player_tag,
            player_name,
            total_voyage_crowns,
            percentage_voyage_crowns
        )
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

    -- 3. Clean up: prune 0-crown records ONLY for players who are no longer active.
    -- [FIX] Removed OR player_name IS NULL - that condition incorrectly deleted
    --       valid 0-crown records for active members with a temporarily-NULL name.
    DELETE FROM drivers.clan_voyage_contributions
    WHERE total_voyage_crowns = 0
      AND player_tag NOT IN (SELECT player_tag FROM drivers.members WHERE is_active = true);

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('VOYAGE_FINALIZATION', 'SUCCESS', 'Auto-finalized ' || v_count || ' expired Clan Voyages.');
    END IF;

    RETURN v_count;
END;
$function$;

-- =============================================================================
-- STEP 3: Fix on_battle_recorded() to pre-populate 0-crown rows before COMPLETED
-- =============================================================================
-- When a voyage completes because the crown target is reached or time has
-- expired, insert 0-crown rows for all non-participating active members BEFORE
-- transitioning the voyage to COMPLETED. This mirrors what finalize_expired_voyages()
-- does, closing the gap that previously left non-participants without a record.
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
                NEW.team_crowns,
                LEAST(ROUND((NEW.team_crowns::numeric / NULLIF(v_target, 0)::numeric) * 100, 2), 100.0)
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
