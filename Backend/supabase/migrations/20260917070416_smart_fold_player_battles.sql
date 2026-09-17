-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Smart folding for drivers.player_battles (~108MB of ~235MB DB), mirroring
-- substrate.fold_cron_history(): a per-day-per-type rollup folded before raw
-- rows are purged, plus a unified access function. Rationale in the commit message.

BEGIN;

INSERT INTO substrate.config (key, value, description) VALUES
    ('BATTLE_FOLD_REVISE_DAYS', '2',
     'Recently folded player_battles days re-aggregated each run, to absorb late-arriving rows.'),
    ('BATTLE_FOLD_MAX_DAYS', '30',
     'Maximum distinct days folded per invocation, so the first backfill cannot open one huge transaction.'),
    ('BATTLE_RAW_KEEP_DAYS', '30',
     'Days of raw drivers.player_battles retained after a day has been folded into player_battle_daily.'),
    ('BATTLE_PURGE_BATCH_ROWS', '20000',
     'Maximum raw player_battles rows deleted per purge invocation.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS drivers.player_battle_daily (
    player_tag text NOT NULL CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$'),
    battle_date date NOT NULL,
    battle_type text NOT NULL,
    battles integer NOT NULL DEFAULT 0,
    wins integer NOT NULL DEFAULT 0,
    fame_earned_sum bigint NOT NULL DEFAULT 0,
    team_crowns_sum bigint NOT NULL DEFAULT 0,
    opponent_crowns_sum bigint NOT NULL DEFAULT 0,
    folded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_tag, battle_date, battle_type)
);

ALTER TABLE drivers.player_battle_daily
    DROP CONSTRAINT IF EXISTS player_battle_daily_player_fkey;
ALTER TABLE drivers.player_battle_daily
    ADD CONSTRAINT player_battle_daily_player_fkey
    FOREIGN KEY (player_tag) REFERENCES drivers.players (player_tag) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_player_battle_daily_player_date
    ON drivers.player_battle_daily (player_tag, battle_date);

ALTER TABLE drivers.player_battle_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION substrate.fold_player_battles()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_days   integer := 0;
    v_revise integer;
    v_max    integer;
BEGIN
    IF NOT pg_try_advisory_xact_lock(1736, 1) THEN
        RETURN 0;
    END IF;

    v_revise := GREATEST(COALESCE(substrate.config_int('BATTLE_FOLD_REVISE_DAYS'), 2), 0);
    v_max    := GREATEST(COALESCE(substrate.config_int('BATTLE_FOLD_MAX_DAYS'), 30), 1);

    WITH target_days AS (
        SELECT x.battle_date
        FROM (
            SELECT DISTINCT (pb.battle_time AT TIME ZONE 'UTC')::date AS battle_date
            FROM drivers.player_battles pb
            WHERE (pb.battle_time AT TIME ZONE 'UTC')::date
                  < (now() AT TIME ZONE 'UTC')::date
        ) x
        WHERE (
                NOT EXISTS (
                    SELECT 1 FROM drivers.player_battle_daily p
                    WHERE p.battle_date = x.battle_date
                )
                OR x.battle_date >= (now() AT TIME ZONE 'UTC')::date - v_revise
              )
        ORDER BY x.battle_date
        LIMIT v_max
    )
    INSERT INTO drivers.player_battle_daily AS t (
        player_tag, battle_date, battle_type, battles, wins,
        fame_earned_sum, team_crowns_sum, opponent_crowns_sum, folded_at
    )
    SELECT
        pb.player_tag,
        (pb.battle_time AT TIME ZONE 'UTC')::date,
        pb.battle_type,
        count(*),
        count(*) FILTER (WHERE pb.win_status),
        sum(pb.fame_earned),
        sum(pb.team_crowns),
        sum(pb.opponent_crowns),
        now()
    FROM drivers.player_battles pb
    JOIN target_days td ON td.battle_date = (pb.battle_time AT TIME ZONE 'UTC')::date
    GROUP BY pb.player_tag, (pb.battle_time AT TIME ZONE 'UTC')::date, pb.battle_type
    ON CONFLICT (player_tag, battle_date, battle_type) DO UPDATE SET
        battles             = EXCLUDED.battles,
        wins                = EXCLUDED.wins,
        fame_earned_sum     = EXCLUDED.fame_earned_sum,
        team_crowns_sum     = EXCLUDED.team_crowns_sum,
        opponent_crowns_sum = EXCLUDED.opponent_crowns_sum,
        folded_at           = now();

    GET DIAGNOSTICS v_days = ROW_COUNT;

    IF v_days > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'SUCCESS', 'player_battles: folded ' || v_days || ' player-day-type rows.');
    END IF;

    RETURN v_days;
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.purge_folded_player_battles()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_keep_days integer;
    v_batch     integer;
    v_deleted   integer;
BEGIN
    v_keep_days := GREATEST(COALESCE(substrate.config_int('BATTLE_RAW_KEEP_DAYS'), 30), 1);
    v_batch     := GREATEST(COALESCE(substrate.config_int('BATTLE_PURGE_BATCH_ROWS'), 20000), 1);

    DELETE FROM drivers.player_battles
    WHERE id IN (
        SELECT pb.id
        FROM drivers.player_battles pb
        WHERE (pb.battle_time AT TIME ZONE 'UTC')::date
              < (now() AT TIME ZONE 'UTC')::date - v_keep_days
          AND EXISTS (
                SELECT 1 FROM drivers.player_battle_daily d
                WHERE d.player_tag   = pb.player_tag
                  AND d.battle_date  = (pb.battle_time AT TIME ZONE 'UTC')::date
                  AND d.battle_type  = pb.battle_type
              )
        LIMIT v_batch
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'SUCCESS',
                'player_battles: ' || v_deleted || ' raw rows evicted beyond ' || v_keep_days || ' days (already folded).');
    END IF;

    RETURN v_deleted;
END;
$function$;

-- Unified access: any pipeline wanting battle stats for a window calls this
-- instead of touching drivers.player_battles or player_battle_daily
-- directly, and gets a correct answer regardless of whether a given day has
-- been folded yet. Folding never touches "today" (still accumulating), so
-- it is always safe to take today live from the raw table and every other
-- day from the rollup -- no double-counting window where both would apply.
CREATE OR REPLACE FUNCTION drivers.get_player_battle_stats(
    p_days integer DEFAULT 30,
    p_player_tags text[] DEFAULT NULL
)
RETURNS TABLE (
    player_tag text,
    battles bigint,
    wins bigint,
    fame_earned_sum bigint,
    team_crowns_sum bigint,
    opponent_crowns_sum bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
    SELECT
        combined.player_tag,
        sum(combined.battles)::bigint,
        sum(combined.wins)::bigint,
        sum(combined.fame_earned_sum)::bigint,
        sum(combined.team_crowns_sum)::bigint,
        sum(combined.opponent_crowns_sum)::bigint
    FROM (
        SELECT player_tag, battles, wins, fame_earned_sum, team_crowns_sum, opponent_crowns_sum
        FROM drivers.player_battle_daily
        WHERE battle_date >= (now() AT TIME ZONE 'UTC')::date - p_days
          AND (p_player_tags IS NULL OR player_tag = ANY (p_player_tags))

        UNION ALL

        SELECT
            pb.player_tag,
            count(*),
            count(*) FILTER (WHERE pb.win_status),
            sum(pb.fame_earned),
            sum(pb.team_crowns),
            sum(pb.opponent_crowns)
        FROM drivers.player_battles pb
        WHERE (pb.battle_time AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
          AND (p_player_tags IS NULL OR pb.player_tag = ANY (p_player_tags))
        GROUP BY pb.player_tag
    ) combined
    GROUP BY combined.player_tag;
$function$;

REVOKE EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION drivers.get_player_battle_stats(integer, text[]) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION substrate.fold_player_battles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION substrate.fold_player_battles() TO service_role;
REVOKE EXECUTE ON FUNCTION substrate.purge_folded_player_battles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION substrate.purge_folded_player_battles() TO service_role;

COMMIT;
