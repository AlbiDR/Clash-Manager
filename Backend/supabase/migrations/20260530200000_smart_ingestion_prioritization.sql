-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: 20260530200000_smart_ingestion_prioritization
 * --------------------------------------------------------
 * Implements per-player adaptive battle log polling during an active
 * Clan Voyage event. Instead of polling all members on every cron run,
 * each member gets an individual next_poll_at timestamp that reflects
 * how recently they were active in-game.
 *
 * Core invariant (SQL mirror of voyage-poll-schedule.ts):
 *
 *   T_poll = BATTLE_LOG_API_WINDOW * V_match
 *
 * where V_match is the assumed minimum match duration derived from
 * the player's last_seen_at tier. The interval is further capped by
 * voyageRemainingSeconds so no player is skipped past the event close.
 *
 * Changes:
 *   1. Add next_poll_at TIMESTAMPTZ to drivers.members.
 *   2. Create drivers.get_voyage_poll_interval_seconds() — the SQL
 *      equivalent of getFinalPollIntervalSeconds() in voyage-poll-schedule.ts.
 *   3. Update public.get_ingestion_targets() to filter by next_poll_at.
 *   4. Update public.ingest_player_battles() to write next_poll_at
 *      after each successful ingestion.
 */

BEGIN;

-- ==========================================================================
-- 1. Schema: add per-player poll schedule column
-- ==========================================================================

ALTER TABLE drivers.members
ADD COLUMN IF NOT EXISTS next_poll_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN drivers.members.next_poll_at IS
    'Earliest timestamp at which this player''s battle log should next be '
    'fetched. NULL means poll immediately on the next ingestion run. '
    'Computed by drivers.get_voyage_poll_interval_seconds() after each '
    'successful ingest_player_battles() call.';

-- ==========================================================================
-- 2. Helper: tier-based poll interval calculator
--    SQL mirror of getFinalPollIntervalSeconds() in voyage-poll-schedule.ts.
--    All constants are declared as named variables — no magic numbers.
-- ==========================================================================

CREATE OR REPLACE FUNCTION drivers.get_voyage_poll_interval_seconds(
    p_last_seen_at           TIMESTAMPTZ,
    p_voyage_remaining_secs  BIGINT      -- NULL when no voyage is active
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = drivers, public
AS $$
DECLARE
    -- External API constraint: Clash Royale battle log window size.
    v_api_window              CONSTANT INTEGER := 25;

    -- Seconds per hour: unit-conversion constant.
    v_seconds_per_hour        CONSTANT NUMERIC := 3600.0;

    -- Tier boundary thresholds (hours since last seen).
    -- Mirror of VOYAGE_TRACKING_BOUNDARIES_HOURS in voyage-poll-schedule.ts.
    v_boundary_active_session CONSTANT INTEGER :=   3;
    v_boundary_recent_close   CONSTANT INTEGER :=   6;
    v_boundary_intermittent   CONSTANT INTEGER :=  12;
    v_boundary_daytime_block  CONSTANT INTEGER :=  18;
    v_boundary_sleep_cycle    CONSTANT INTEGER :=  24;
    v_boundary_short_absence  CONSTANT INTEGER :=  48;
    v_boundary_mid_absence    CONSTANT INTEGER :=  72;
    v_boundary_long_absence   CONSTANT INTEGER := 120;
    v_boundary_dormant        CONSTANT INTEGER := 168;

    -- Target velocities: assumed minimum match duration per tier (seconds).
    -- Mirror of VOYAGE_TRACKING_VELOCITIES_SECONDS in voyage-poll-schedule.ts.
    v_velocity_t1             CONSTANT INTEGER :=  72; -- 01:12 anchor
    v_velocity_t2             CONSTANT INTEGER :=  80; -- 01:20
    v_velocity_t3             CONSTANT INTEGER :=  90; -- 01:30
    v_velocity_t4             CONSTANT INTEGER := 100; -- 01:40
    v_velocity_t5             CONSTANT INTEGER := 120; -- 02:00
    v_velocity_t6             CONSTANT INTEGER := 150; -- 02:30
    v_velocity_t7             CONSTANT INTEGER := 180; -- 03:00
    v_velocity_t8             CONSTANT INTEGER := 216; -- 03:36
    v_velocity_t9             CONSTANT INTEGER := 288; -- 04:48 safety limit
    v_velocity_t10            CONSTANT INTEGER := 300; -- 05:00 dormant anchor

    v_hours_since_seen NUMERIC;
    v_velocity         INTEGER;
    v_interval         BIGINT;
BEGIN
    v_hours_since_seen := EXTRACT(EPOCH FROM (now() - p_last_seen_at)) / v_seconds_per_hour;

    v_velocity := CASE
        WHEN v_hours_since_seen <= v_boundary_active_session THEN v_velocity_t1
        WHEN v_hours_since_seen <= v_boundary_recent_close   THEN v_velocity_t2
        WHEN v_hours_since_seen <= v_boundary_intermittent   THEN v_velocity_t3
        WHEN v_hours_since_seen <= v_boundary_daytime_block  THEN v_velocity_t4
        WHEN v_hours_since_seen <= v_boundary_sleep_cycle    THEN v_velocity_t5
        WHEN v_hours_since_seen <= v_boundary_short_absence  THEN v_velocity_t6
        WHEN v_hours_since_seen <= v_boundary_mid_absence    THEN v_velocity_t7
        WHEN v_hours_since_seen <= v_boundary_long_absence   THEN v_velocity_t8
        WHEN v_hours_since_seen <= v_boundary_dormant        THEN v_velocity_t9
        ELSE                                                       v_velocity_t10
    END;

    v_interval := v_api_window * v_velocity;

    -- Voyage ceiling: ensure the player is polled at least once more
    -- before the event closes, regardless of inactivity tier.
    IF p_voyage_remaining_secs IS NOT NULL AND p_voyage_remaining_secs > 0 THEN
        v_interval := LEAST(v_interval, p_voyage_remaining_secs);
    END IF;

    RETURN v_interval;
END;
$$;

-- ==========================================================================
-- 3. Update get_ingestion_targets: filter by next_poll_at
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.get_ingestion_targets()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_recruits               JSONB;
    v_members                JSONB;
    v_voyage_remaining_secs  BIGINT;
BEGIN
    -- Resolve active voyage remaining time (NULL when no voyage is active).
    SELECT GREATEST(0, EXTRACT(EPOCH FROM (end_at - now()))::BIGINT)
    INTO v_voyage_remaining_secs
    FROM drivers.clan_voyage
    WHERE status = 'ACTIVE'
    ORDER BY created_at DESC
    LIMIT 1;

    -- Members: only those whose scheduled poll time has elapsed or is unset.
    -- next_poll_at NULL means "never polled yet" — always include.
    SELECT jsonb_agg(player_tag)
    INTO v_members
    FROM drivers.members
    WHERE is_active = true
      AND (next_poll_at IS NULL OR next_poll_at <= now());

    SELECT jsonb_agg(player_tag)
    INTO v_recruits
    FROM drivers.recruits
    WHERE status = 'ACTIVE'
    LIMIT 50;

    RETURN jsonb_build_object(
        'recruits', COALESCE(v_recruits, '[]'::JSONB),
        'members',  COALESCE(v_members,  '[]'::JSONB)
    );
END;
$$;

-- ==========================================================================
-- 4. Update ingest_player_battles: write next_poll_at after ingestion
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag TEXT, p_payload JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_battle                 RECORD;
    v_voyage_remaining_secs  BIGINT;
    v_interval_secs          BIGINT;
    v_member_last_seen       TIMESTAMPTZ;
BEGIN
    -- Insert / skip duplicate battles.
    FOR v_battle IN
        SELECT
            to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"') AS battle_time,
            t.type                   AS battle_type,
            t.opponent_player_tag,
            t.opponent_player_name,
            t.team_crowns,
            t.opponent_crowns,
            CASE
                WHEN t.team_crowns > t.opponent_crowns THEN 'win'
                WHEN t.team_crowns < t.opponent_crowns THEN 'loss'
                ELSE 'draw'
            END AS result,
            (t.team_crowns > t.opponent_crowns) AS win_status
        FROM (
            SELECT
                item->>'battleTime'             AS bt,
                item->>'type'                   AS type,
                item->'team'->0->>'tag'         AS team_tag,
                COALESCE((item->'team'->0->>'crowns')::INT, 0)     AS team_crowns,
                item->'opponent'->0->>'tag'     AS opponent_player_tag,
                item->'opponent'->0->>'name'    AS opponent_player_name,
                COALESCE((item->'opponent'->0->>'crowns')::INT, 0) AS opponent_crowns
            FROM jsonb_array_elements(p_payload) item
            WHERE item->>'battleTime' IS NOT NULL
              AND item->'opponent' IS NOT NULL
        ) t
    LOOP
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
        VALUES (
            p_tag,
            v_battle.battle_time,
            v_battle.battle_type,
            v_battle.win_status,
            v_battle.result,
            v_battle.team_crowns,
            v_battle.opponent_crowns,
            v_battle.opponent_player_tag,
            v_battle.opponent_player_name
        )
        ON CONFLICT (player_tag, battle_time) DO NOTHING;
    END LOOP;

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
    -- Only applies to clan members (not recruits — they have no last_seen_at).
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
        SET next_poll_at = now() + make_interval(secs => v_interval_secs)
        WHERE player_tag = p_tag;
    END IF;
END;
$$;

COMMIT;
