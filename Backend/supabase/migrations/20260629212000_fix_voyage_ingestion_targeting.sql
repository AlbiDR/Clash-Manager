-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Migration: 20260629212000_fix_voyage_ingestion_targeting
--
-- PROBLEM:
--   get_ingestion_targets() filters active members by next_poll_at, which is
--   a schedule derived from their last inactivity tier. When a Clan Voyage
--   activates, members who were recently inactive carry a long next_poll_at
--   (60-90+ minutes). They are silently skipped on every pipeline run until
--   that scheduled time expires naturally. The voyage ceiling logic inside
--   ingest_player_battles() never fires for them because they never reach
--   that function. This causes systematic under-reporting of voyage crowns.
--
-- FIX:
--   When a Clan Voyage is active, bypass next_poll_at entirely and return
--   ALL active members as ingestion targets. The per-player voyage ceiling
--   inside ingest_player_battles() already handles adaptive re-scheduling
--   once a player is polled, so no additional changes are required there.
--   The fix is contained to this single function.
--
-- UNCHANGED BEHAVIOUR:
--   - When no voyage is active, the normal next_poll_at scheduling is
--     preserved exactly as before.
--   - The recruits query is unchanged.

CREATE OR REPLACE FUNCTION public.get_ingestion_targets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_recruits               JSONB;
    v_members                JSONB;
    v_voyage_remaining_secs  BIGINT;
    v_voyage_is_active       BOOLEAN;
BEGIN
    -- Resolve active voyage state and remaining time.
    -- NULL remaining means no voyage is currently active.
    SELECT
        TRUE,
        GREATEST(0, EXTRACT(EPOCH FROM (end_at - now()))::BIGINT)
    INTO v_voyage_is_active, v_voyage_remaining_secs
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    v_voyage_is_active := COALESCE(v_voyage_is_active, FALSE);

    -- Members targeting logic:
    --   [VOYAGE ACTIVE]  Bypass next_poll_at entirely. All active members
    --                    must be polled on every pipeline run to guarantee
    --                    zero battle-log gaps during the event window.
    --                    The per-player adaptive ceiling is applied inside
    --                    ingest_player_battles() once they are fetched.
    --
    --   [NO VOYAGE]      Normal schedule-based targeting: include only
    --                    members whose poll window has elapsed or is unset.
    --                    next_poll_at IS NULL means "never polled" - always
    --                    include.
    SELECT jsonb_agg(player_tag)
    INTO v_members
    FROM drivers.members
    WHERE is_active = true
      AND (
          v_voyage_is_active
          OR next_poll_at IS NULL
          OR next_poll_at <= now()
      );

    SELECT jsonb_agg(player_tag)
    INTO v_recruits
    FROM drivers.recruits
    WHERE status = 'ACTIVE'
    LIMIT 50;

    RETURN jsonb_build_object(
        'drivers.recruits', COALESCE(v_recruits, '[]'::JSONB),
        'drivers.members',  COALESCE(v_members,  '[]'::JSONB)
    );
END;
$function$;
