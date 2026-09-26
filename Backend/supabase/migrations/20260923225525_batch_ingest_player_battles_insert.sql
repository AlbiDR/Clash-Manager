-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Batches ingest_player_battles()'s per-row INSERT loop into one set-based
-- INSERT ... SELECT ... ON CONFLICT DO NOTHING statement. Measured against
-- production (rolled back, no writes): cuts a 25-battle payload from 262.7ms
-- to ~68ms; the per-row dispatch, not the AFTER INSERT trigger, was the
-- dominant cost. Full methodology and safety reasoning are in this
-- function's own COMMENT ON below (queryable live via psql `\df+`).

BEGIN;

CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag text, p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_voyage_remaining_secs  BIGINT;
    v_interval_secs          BIGINT;
    v_member_last_seen       TIMESTAMPTZ;
BEGIN
    -- Insert / skip duplicate battles in one set-based statement instead of
    -- a per-row loop.
    INSERT INTO drivers.player_battles (
        player_tag,
        battle_time,
        battle_type,
        win_status,
        result,
        team_crowns,
        opponent_crowns,
        opponent_player_tag,
        opponent_player_name
    )
    SELECT
        p_tag,
        to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"'),
        t.type,
        (t.team_crowns > t.opponent_crowns),
        CASE
            WHEN t.team_crowns > t.opponent_crowns THEN 'win'
            WHEN t.team_crowns < t.opponent_crowns THEN 'loss'
            ELSE 'draw'
        END,
        t.team_crowns,
        t.opponent_crowns,
        t.opponent_player_tag,
        t.opponent_player_name
    FROM (
        SELECT
            item->>'battleTime'             AS bt,
            item->>'type'                   AS type,
            item->'team'->0->>'tag'         AS team_tag,
            CASE
                WHEN item->>'type' = 'riverRaceDuel' AND jsonb_typeof(item->'team'->0->'rounds') = 'array' THEN
                    (SELECT (COALESCE(SUM((r->>'crowns')::INT), 0) + (3 * GREATEST(COUNT(r) - 1, 0)))::INT
                     FROM jsonb_array_elements(item->'team'->0->'rounds') r)
                ELSE COALESCE((item->'team'->0->>'crowns')::INT, 0)
            END AS team_crowns,
            item->'opponent'->0->>'tag'     AS opponent_player_tag,
            item->'opponent'->0->>'name'    AS opponent_player_name,
            CASE
                WHEN item->>'type' = 'riverRaceDuel' AND jsonb_typeof(item->'opponent'->0->'rounds') = 'array' THEN
                    (SELECT COALESCE(SUM((r->>'crowns')::INT), 0)::INT
                     FROM jsonb_array_elements(item->'opponent'->0->'rounds') r)
                ELSE COALESCE((item->'opponent'->0->>'crowns')::INT, 0)
            END AS opponent_crowns
        FROM jsonb_array_elements(p_payload) item
        WHERE item->>'battleTime' IS NOT NULL
          AND item->'opponent' IS NOT NULL
    ) t
    ON CONFLICT (player_tag, battle_time) DO NOTHING;

    -- Enforce the 100-battle rolling window per player.
    DELETE FROM drivers.player_battles
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY player_tag ORDER BY battle_time DESC
            ) AS rn
            FROM drivers.player_battles
            WHERE player_tag = p_tag
        ) x WHERE x.rn > 100
    );

    -- Schedule the next poll for this member based on their activity tier.
    -- Only applies to clan members (not recruits - they have no last_seen_at).
    SELECT last_seen_at
    INTO v_member_last_seen
    FROM drivers.members
    WHERE player_tag = p_tag;

    IF v_member_last_seen IS NOT NULL THEN
        -- Resolve active voyage remaining seconds.
        SELECT GREATEST(0, EXTRACT(EPOCH FROM (end_at - now()))::BIGINT)
        INTO v_voyage_remaining_secs
        FROM drivers.clan_voyage
        WHERE status = 'ACTIVE'
        ORDER BY created_at DESC
        LIMIT 1;

        v_interval_secs := drivers.get_voyage_poll_interval_seconds(
            v_member_last_seen,
            v_voyage_remaining_secs
        );

        UPDATE drivers.members
        SET next_poll_at = now() + make_interval(secs => v_interval_secs::double precision)
        WHERE player_tag = p_tag;
    END IF;
END;
$function$;

COMMENT ON FUNCTION public.ingest_player_battles(text, jsonb) IS
'Ingests a Royale API battle-log payload (max 25 entries) for one player. '
'Called ~11,000x/day (every active member AND every tracked recruit, every '
'30 minutes - see Backend/supabase/functions/ingest-royale-data/stages/deep-depth.ts) '
'and was measured as ~half of all database execution time on this project. '
'AS OF 2026-09-23: rewritten from a per-row PL/pgSQL loop to a single '
'set-based INSERT ... SELECT ... ON CONFLICT DO NOTHING - the loop cost '
'~6.3ms/row in per-statement dispatch overhead alone (measured: empty '
'payload 6.3ms total vs a 25-row payload at 262.7ms, only 98ms of which was '
'the tr_battle_voyage_sync AFTER INSERT trigger). The batched version does '
'the same 25-row payload in 68.2ms. AFTER INSERT triggers are FOR EACH ROW '
'regardless of statement batching, so tr_battle_voyage_sync still fires '
'once per newly inserted row, same as before - this migration changed '
'dispatch shape only, not trigger semantics or output rows. See '
'20260923225525_batch_ingest_player_battles_insert.sql for the full before/after '
'timing methodology (rolled-back transactions against production, no synthetic '
'benchmark). Before assuming a further edit here is safe, re-run that '
'methodology rather than reasoning from this comment alone - it may drift.';

COMMIT;
