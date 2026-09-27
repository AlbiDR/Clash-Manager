-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Scores multi-round battles (clan-war duels) per round: voyage credit is each
-- round credited like a battle, and win/loss is decided by rounds won.
-- Only the per-battle scoring changes. Reasoning in the COMMENT ON below.

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
        to_timestamp(b.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"'),
        b.type,
        (scored.result = 'win'),
        scored.result,
        scored.team_crowns,
        scored.opponent_crowns,
        b.opponent_player_tag,
        b.opponent_player_name
    FROM (
        SELECT
            item->>'battleTime'                                   AS bt,
            item->>'type'                                         AS type,
            item->'opponent'->0->>'tag'                           AS opponent_player_tag,
            item->'opponent'->0->>'name'                          AS opponent_player_name,
            COALESCE((item->'team'->0->>'crowns')::INT, 0)        AS team_plain,
            COALESCE((item->'opponent'->0->>'crowns')::INT, 0)    AS opponent_plain,
            item->'team'->0->'rounds'                             AS team_rounds,
            item->'opponent'->0->'rounds'                         AS opponent_rounds
        FROM jsonb_array_elements(p_payload) item
        WHERE item->>'battleTime' IS NOT NULL
          AND item->'opponent' IS NOT NULL
    ) b
    -- Pair round i of the team with round i of the opponent. A non-array side
    -- contributes no rows, which makes the battle fall back to plain crowns.
    CROSS JOIN LATERAL (
        SELECT
            count(*)                                                AS played,
            -- Counted, not bool_and(): bool_and skips NULLs, so a round with no
            -- crowns key would otherwise pass as numeric.
            count(*) FILTER (WHERE jsonb_typeof(t.round->'crowns') = 'number'
                               AND jsonb_typeof(o.round->'crowns') = 'number') AS numeric_pairs,
            sum(CASE WHEN jsonb_typeof(t.round->'crowns') = 'number' THEN (t.round->>'crowns')::numeric::int END) AS team_sum,
            sum(CASE WHEN jsonb_typeof(o.round->'crowns') = 'number' THEN (o.round->>'crowns')::numeric::int END) AS opponent_sum,
            count(*) FILTER (WHERE jsonb_typeof(t.round->'crowns') = 'number' AND jsonb_typeof(o.round->'crowns') = 'number'
                               AND (t.round->>'crowns')::numeric > (o.round->>'crowns')::numeric) AS team_won,
            count(*) FILTER (WHERE jsonb_typeof(t.round->'crowns') = 'number' AND jsonb_typeof(o.round->'crowns') = 'number'
                               AND (o.round->>'crowns')::numeric > (t.round->>'crowns')::numeric) AS opponent_won
          FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.team_rounds) = 'array' THEN b.team_rounds ELSE '[]'::jsonb END)
               WITH ORDINALITY AS t(round, idx)
          JOIN jsonb_array_elements(CASE WHEN jsonb_typeof(b.opponent_rounds) = 'array' THEN b.opponent_rounds ELSE '[]'::jsonb END)
               WITH ORDINALITY AS o(round, idx) USING (idx)
    ) rounds
    CROSS JOIN LATERAL (
        -- CASE, not AND: jsonb_array_length() raises on a non-array, and AND does
        -- not guarantee evaluation order.
        SELECT CASE
                   WHEN jsonb_typeof(b.team_rounds) = 'array' AND jsonb_typeof(b.opponent_rounds) = 'array'
                   THEN rounds.played > 0
                        AND rounds.numeric_pairs = rounds.played
                        AND jsonb_array_length(b.team_rounds) = jsonb_array_length(b.opponent_rounds)
                   ELSE false
               END AS usable
    ) gate
    CROSS JOIN LATERAL (
        SELECT
            -- +3 per extra round makes on_battle_recorded's team + (3 - opponent)
            -- equal the sum of that expression over every round (never negative).
            CASE WHEN gate.usable THEN rounds.team_sum + 3 * (rounds.played - 1) ELSE b.team_plain END AS team_crowns,
            CASE WHEN gate.usable THEN rounds.opponent_sum ELSE b.opponent_plain END                 AS opponent_crowns,
            CASE
                WHEN gate.usable AND rounds.team_won > rounds.opponent_won THEN 'win'
                WHEN gate.usable AND rounds.team_won < rounds.opponent_won THEN 'loss'
                -- No rounds, or rounds tied on crowns (a tiebreak we cannot see):
                -- decide on the battle's own crowns, exactly as before.
                WHEN b.team_plain > b.opponent_plain THEN 'win'
                WHEN b.team_plain < b.opponent_plain THEN 'loss'
                ELSE 'draw'
            END AS result
    ) scored
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
'Ingests a Royale API battle-log payload (max 25 entries) for one player in one '
'set-based INSERT ... SELECT ... ON CONFLICT DO NOTHING (batched 2026-09-23: a 25-row '
'payload went from 262.7ms to ~68ms, see 20260923225525). Called by deep-depth.ts for '
'every member and for recruits whose log holds something new (see get_latest_battle_times). '
'MULTI-ROUND SCORING (2026-09-27, 20260927005354): when both sides carry a rounds array of '
'equal length whose entries all have numeric crowns (clan-war duels), team_crowns = sum of '
'team round crowns + 3 per extra round and opponent_crowns = sum of opponent round crowns, so '
'the voyage credit expression team_crowns + (3 - opponent_crowns) used by on_battle_recorded, '
'refresh_voyage_contributions and on_contribution_manual_override_updated equals the sum over '
'rounds of (team + 3 - opponent): each round credited like a battle, never negative. Win/loss '
'is decided by rounds won (round i vs round i on crowns). Rounds tied on crowns, missing, '
'malformed or of unequal length fall back to the battle''s own crowns, the pre-2026-09-27 rule. '
'NOTE team_crowns is therefore NOT a raw crown count for duels. '
'HISTORY: 20260620120000 introduced the +3-per-round crowns formula, but it never ran: the edge '
'function''s valibot v.object schema stripped rounds until 2026-09-27, and 173 of 230 stored duels '
'score 0-2, which that formula cannot produce. Had it run, it would also have recorded a duel '
'swept 0-2 as a win, because the bonus was added to the team side regardless of who won rounds.';

COMMIT;
