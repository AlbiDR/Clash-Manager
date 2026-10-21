-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE drivers.recruits ADD COLUMN last_battle_poll_at timestamptz;
COMMENT ON COLUMN drivers.recruits.last_battle_poll_at IS
 'Last actual battle-log fetch attempt, including failed or unchanged responses. Selection alone never advances this cursor.';

-- Preserve the existing intended 50-recruit ceiling as an operational bound.
INSERT INTO substrate.config(key,value,description)
VALUES ('RECRUIT_BATTLE_POLL_BATCH_SIZE','50',
 'Maximum recruit battle-log attempts selected per ingestion run; integer from 1 to the existing safety ceiling of 50. Members are never capped by this setting.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_ingestion_targets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_batch_value text;
    v_batch_size integer;
    v_recruits               JSONB;
    v_members                JSONB;
    v_voyage_remaining_secs  BIGINT;
    v_voyage_is_active       BOOLEAN;
BEGIN
    SELECT value INTO v_batch_value FROM substrate.config
    WHERE key = 'RECRUIT_BATTLE_POLL_BATCH_SIZE';
    BEGIN
        v_batch_size := v_batch_value::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid recruit battle poll batch size';
    END;
    IF v_batch_size IS NULL OR v_batch_size < 1 OR v_batch_size > 50 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recruit battle poll batch size must be between 1 and 50';
    END IF;

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
    SELECT jsonb_agg(player_tag ORDER BY next_poll_at ASC NULLS FIRST, player_tag COLLATE "C")
    INTO v_members
    FROM drivers.members
    WHERE is_active = true
      AND (
          v_voyage_is_active
          OR next_poll_at IS NULL
          OR next_poll_at <= now()
      );

    -- LIMIT must constrain input rows, not the single aggregate output row.
    SELECT jsonb_agg(target.player_tag ORDER BY target.last_battle_poll_at ASC NULLS FIRST,
                     target.player_tag COLLATE "C")
    INTO v_recruits
    FROM (
        SELECT player_tag, last_battle_poll_at
        FROM drivers.recruits
        WHERE status = 'ACTIVE'
        ORDER BY last_battle_poll_at ASC NULLS FIRST, player_tag COLLATE "C"
        LIMIT v_batch_size
    ) AS target;

    RETURN jsonb_build_object(
        'drivers.recruits', COALESCE(v_recruits, '[]'::JSONB),
        'drivers.members',  COALESCE(v_members,  '[]'::JSONB)
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.record_recruit_battle_polls(p_player_tags text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_batch_value text;
    v_batch_size integer;
    v_attempted_at timestamptz := clock_timestamp();
BEGIN
    SELECT value INTO v_batch_value FROM substrate.config
    WHERE key = 'RECRUIT_BATTLE_POLL_BATCH_SIZE';
    BEGIN
        v_batch_size := v_batch_value::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid recruit battle poll batch size';
    END;
    IF v_batch_size IS NULL OR v_batch_size < 1 OR v_batch_size > 50 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Recruit battle poll batch size must be between 1 and 50';
    END IF;

    IF p_player_tags IS NULL OR cardinality(p_player_tags) > v_batch_size
       OR (cardinality(p_player_tags) > 0 AND array_ndims(p_player_tags) <> 1) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid recruit battle poll batch';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_player_tags) AS input(tag)
               WHERE tag IS NULL OR tag !~ '^#[0289CGJLPQRUVY]+$') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid recruit player tag';
    END IF;

    -- Lock in the same tag order as other recruit writers. Duplicates mark once.
    WITH locked AS MATERIALIZED (
        SELECT player_tag FROM drivers.recruits
        WHERE player_tag = ANY(p_player_tags)
        ORDER BY player_tag COLLATE "C"
        FOR UPDATE
    )
    UPDATE drivers.recruits AS recruit
    SET last_battle_poll_at = v_attempted_at
    FROM locked
    WHERE recruit.player_tag = locked.player_tag;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_recruit_battle_polls(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_recruit_battle_polls(text[]) TO service_role;
COMMENT ON FUNCTION public.record_recruit_battle_polls(text[]) IS
 'Service-only bounded acknowledgment of actual recruit battle-log fetch attempts, including failed and unchanged responses; never mark merely selected or queued targets.';

COMMIT;
