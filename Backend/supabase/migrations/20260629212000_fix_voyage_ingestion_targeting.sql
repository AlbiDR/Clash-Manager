-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


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
