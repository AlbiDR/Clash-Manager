-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Bug Audit Batch 2 — 13 Fixes
-- Bugs 17-29: search_path pins, dead-code drops, and semantic corrections.
-- =============================================================================

-- ============================================================
-- CLUSTER A — BUGS 17-23: Pin search_path on all unpinned functions
-- ============================================================

-- BUG 17: public.get_headhunter_context — SECURITY DEFINER, no search_path
CREATE OR REPLACE FUNCTION public.get_headhunter_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'drivers', 'substrate' AS $$
DECLARE
    v_required_trophies INTEGER;
    v_exclusion_tags    TEXT[];
BEGIN
    SELECT COALESCE(required_trophies, 0)
    INTO v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    SELECT array_agg(DISTINCT player_tag)
    INTO v_exclusion_tags
    FROM (
        SELECT player_tag FROM drivers.recruit_blacklist
        UNION
        SELECT player_tag FROM drivers.members
        UNION
        SELECT player_tag FROM drivers.recruits
    ) exclusions
    WHERE player_tag IS NOT NULL;

    RETURN jsonb_build_object(
        'required_trophies', COALESCE(v_required_trophies, 0),
        'exclusion_tags',    COALESCE(v_exclusion_tags, ARRAY[]::TEXT[])
    );
END; $$;

-- BUG 18: public.get_shadow_discovery_targets — no search_path
CREATE OR REPLACE FUNCTION public.get_shadow_discovery_targets(p_limit integer DEFAULT 50)
RETURNS TABLE(opponent_player_tag text) LANGUAGE plpgsql SET search_path TO 'public', 'drivers' AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT pb.opponent_player_tag
    FROM drivers.player_battles pb
    WHERE pb.battle_time > (now() - interval '24 hours')
      AND pb.opponent_player_tag IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM drivers.members m        WHERE m.player_tag = pb.opponent_player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.recruits r       WHERE r.player_tag = pb.opponent_player_tag)
      AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = pb.opponent_player_tag)
    ORDER BY pb.opponent_player_tag
    LIMIT p_limit;
END; $$;

-- BUG 19: public.ingest_player_battles — no search_path
CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag text, p_payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'drivers' AS $$
DECLARE
    v_battle      RECORD;
    v_player_name TEXT;
BEGIN
    SELECT player_name INTO v_player_name FROM (
        SELECT player_name FROM drivers.members  WHERE player_tag = p_tag
        UNION
        SELECT player_name FROM drivers.recruits WHERE player_tag = p_tag
    ) x LIMIT 1;

    INSERT INTO drivers.players (player_tag, player_name)
    VALUES (p_tag, COALESCE(v_player_name, 'Unknown Player'))
    ON CONFLICT (player_tag) DO NOTHING;

    FOR v_battle IN
        SELECT
            to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"') AS battle_time,
            t.type                                            AS battle_type,
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
                item->>'battleTime'                                    AS bt,
                item->>'type'                                          AS type,
                item->'team'->0->>'tag'                                AS team_tag,
                COALESCE((item->'team'->0->>'crowns')::INT, 0)        AS team_crowns,
                item->'opponent'->0->>'tag'                            AS opponent_player_tag,
                item->'opponent'->0->>'name'                           AS opponent_player_name,
                COALESCE((item->'opponent'->0->>'crowns')::INT, 0)    AS opponent_crowns
            FROM jsonb_array_elements(p_payload) item
            WHERE item->>'battleTime' IS NOT NULL
              AND item->'opponent' IS NOT NULL
        ) t
    LOOP
        INSERT INTO drivers.player_battles (
            player_tag, battle_time, battle_type, win_status, result,
            team_crowns, opponent_crowns, opponent_player_tag, opponent_player_name
        )
        VALUES (
            p_tag, v_battle.battle_time, v_battle.battle_type, v_battle.win_status,
            v_battle.result, v_battle.team_crowns, v_battle.opponent_crowns,
            v_battle.opponent_player_tag, v_battle.opponent_player_name
        )
        ON CONFLICT (player_tag, battle_time) DO NOTHING;
    END LOOP;

    DELETE FROM drivers.player_battles
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY player_tag ORDER BY battle_time DESC) AS rn
            FROM drivers.player_battles
            WHERE player_tag = p_tag
        ) x WHERE x.rn > 100
    );
END; $$;

-- BUG 20: public.maintenance_janitor — SECURITY DEFINER, no search_path, + wrong column name
-- Fixed: members.tag -> members.player_tag (leaver-defense subquery)
CREATE OR REPLACE FUNCTION public.maintenance_janitor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'drivers', 'substrate' AS $$
BEGIN
    -- A. Raw JSON (Substrate) - 7 Day Retention
    DELETE FROM substrate.raw_clan_profile   WHERE ingested_at < NOW() - INTERVAL '7 days';
    DELETE FROM substrate.raw_clan_members   WHERE ingested_at < NOW() - INTERVAL '7 days';
    DELETE FROM substrate.raw_river_race     WHERE ingested_at < NOW() - INTERVAL '7 days';
    DELETE FROM substrate.raw_war_log        WHERE ingested_at < NOW() - INTERVAL '7 days';
    DELETE FROM substrate.raw_scout_logs     WHERE ingested_at < NOW() - INTERVAL '7 days';
    DELETE FROM substrate.governance_telemetry WHERE created_at < NOW() - INTERVAL '7 days';

    -- B. Combat Intel (Opponents) - 7 Day Retention
    DELETE FROM drivers.war_opponents WHERE updated_at < NOW() - INTERVAL '7 days';

    -- C. LEAVER DEFENSE — corrected: tag -> player_tag (Bug 20 / Bug 29 fix)
    DELETE FROM drivers.player_battles
    WHERE player_tag NOT IN (
        SELECT DISTINCT player_tag FROM drivers.members
        WHERE snapshot_date > NOW() - INTERVAL '7 days'
    )
    AND battle_time < NOW() - INTERVAL '7 days';

    -- D. RESIDENT HISTORY (365-Day Ledger Maintenance)
    DELETE FROM drivers.members WHERE snapshot_date < NOW() - INTERVAL '365 days';

    -- E. Battle Depth (100 Sample Limit per Resident)
    WITH battle_ranks AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY player_tag ORDER BY battle_time DESC) AS r
        FROM drivers.player_battles
    )
    DELETE FROM drivers.player_battles WHERE id IN (SELECT id FROM battle_ranks WHERE r > 100);

    ANALYZE;
END; $$;

-- BUG 21: public.report_dead_recruit — SECURITY DEFINER, no search_path
CREATE OR REPLACE FUNCTION public.report_dead_recruit(p_player_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'drivers', 'substrate' AS $$
DECLARE
    v_player_name TEXT;
    v_raw_score   NUMERIC;
BEGIN
    SELECT
        COALESCE(r.player_name, p.player_name, 'Unknown'),
        COALESCE(r.raw_potential_score, 0.0)
    INTO v_player_name, v_raw_score
    FROM drivers.players p
    LEFT JOIN drivers.recruits r ON r.player_tag = p.player_tag
    WHERE p.player_tag = p_player_tag;

    INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Unknown'),
        'GHOST_DETECTED',
        COALESCE(v_raw_score, 0.0),
        0.0,
        'Player profile returned 404 (Not Found). Universal registry eviction and blacklisting initiated.'
    );

    INSERT INTO drivers.recruit_blacklist (player_tag, player_name, raw_potential_score, reason, expires_at)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Ghost'),
        COALESCE(v_raw_score, 0.0),
        'GHOST_404',
        NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + INTERVAL '7 days',
        reason     = 'GHOST_404';

    DELETE FROM drivers.players WHERE player_tag = p_player_tag;

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('GHOST_EVICTION', 'INFO', 'Universal eviction of ghost player: ' || p_player_tag);
END; $$;

-- BUG 22: substrate.execute_nightly_maintenance — SECURITY DEFINER, no search_path
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'substrate', 'drivers', 'public' AS $$
DECLARE v_start_time TIMESTAMPTZ := NOW();
BEGIN
    PERFORM substrate.pipeline_watchdog();

    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status            = 'RUNNING',
        last_triggered_at = EXCLUDED.last_triggered_at,
        last_message      = EXCLUDED.last_message;

    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.rotate_recruits();

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Watchdog performed. All purges executed. Recruitment rotated.',
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';

EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('MAINTENANCE_FAILURE', 'ERROR', SQLERRM);

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'NIGHTLY_MAINTENANCE';
    RAISE;
END; $$;

-- BUG 23: substrate.pipeline_watchdog — SECURITY DEFINER, no search_path
CREATE OR REPLACE FUNCTION substrate.pipeline_watchdog()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'substrate', 'public' AS $$
DECLARE v_reset_count INTEGER;
BEGIN
    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = 'Watchdog timeout: Pipeline exceeded 2-hour execution limit and was force-reset.',
        updated_at      = NOW()
    WHERE status           = 'RUNNING'
      AND last_triggered_at < (NOW() - INTERVAL '2 hours');

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    IF v_reset_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('WATCHDOG_INTERVENTION', 'WARNING',
                'Watchdog force-reset ' || v_reset_count || ' hung pipelines.');
    END IF;

    RETURN v_reset_count;
END; $$;

-- ============================================================
-- CLUSTER B — BUGS 24-26: Drop dead-code legacy ingestion functions
-- Superseded by shredder trigger pattern (substrate.raw_* → trigger → drivers.*)
-- Confirmed zero references in any edge function source.
-- ============================================================

DROP FUNCTION IF EXISTS public.ingest_clan_members(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.ingest_river_race(jsonb)    CASCADE;
DROP FUNCTION IF EXISTS public.ingest_war_log(jsonb)       CASCADE;

-- ============================================================
-- CLUSTER C — BUGS 27-29: Semantic & logic corrections
-- ============================================================

-- BUG 27: public.ingest_clan_profile — ON CONFLICT (tag, snapshot_date)
-- Column is `clan_tag`, not `tag`. Also `name` -> `clan_name`.
-- Every upsert silently became a duplicate insert.
CREATE OR REPLACE FUNCTION public.ingest_clan_profile(p_payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'drivers', 'substrate' AS $$
BEGIN
    INSERT INTO substrate.raw_clan_profile (payload) VALUES (p_payload);

    INSERT INTO drivers.clans (
        clan_tag, clan_name, description, badge_id,
        member_count, required_trophies, type, last_ingested_at, snapshot_date
    )
    VALUES (
        p_payload->>'tag',
        p_payload->>'name',
        p_payload->>'description',
        (p_payload->>'badgeId')::INTEGER,
        (p_payload->>'members')::INTEGER,
        (p_payload->>'requiredTrophies')::INTEGER,
        p_payload->>'type',
        NOW(),
        CURRENT_DATE
    )
    ON CONFLICT (clan_tag, snapshot_date) DO UPDATE SET
        clan_name         = EXCLUDED.clan_name,
        description       = EXCLUDED.description,
        badge_id          = EXCLUDED.badge_id,
        member_count      = EXCLUDED.member_count,
        required_trophies = EXCLUDED.required_trophies,
        type              = EXCLUDED.type,
        last_ingested_at  = EXCLUDED.last_ingested_at,
        updated_at        = NOW();
END; $$;

-- BUG 28: substrate.report_anchor_yield — rate-limited scans (yield=0) are
-- indistinguishable from dead anchors, causing valid keywords to be marked STALE.
-- Add rate_limited_scans column to discovery_anchors and gate staleness on it.
ALTER TABLE substrate.discovery_anchors
    ADD COLUMN IF NOT EXISTS rate_limited_scans INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION substrate.report_anchor_yield(p_keyword text, p_yield integer, p_was_rate_limited boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'substrate', 'public' AS $$
BEGIN
    UPDATE substrate.discovery_anchors
    SET
        total_yield          = total_yield + p_yield,
        total_scans          = total_scans + 1,
        rate_limited_scans   = rate_limited_scans + CASE WHEN p_was_rate_limited THEN 1 ELSE 0 END,
        last_yield           = p_yield,
        last_scanned_at      = NOW()
    WHERE keyword = p_keyword;

    -- Autonomous Quality Control:
    -- Only mark STALE when the anchor consistently yields nothing
    -- on scans that were NOT rate-limited (i.e. the API responded normally).
    UPDATE substrate.discovery_anchors
    SET status = 'STALE'
    WHERE keyword = p_keyword
      AND (total_scans - rate_limited_scans) > 20
      AND total_yield = 0;
END; $$;

-- BUG 29: public.maintenance_janitor leaver-defense column bug is fixed in Bug 20 above.
-- The substrate.execute_nightly_maintenance path is the authoritative maintenance entry point.
-- maintenance_janitor (public) is a vestigial duplicate. Pin its search_path (done in Bug 20)
-- and add a deprecation notice comment — it will be dropped in the next cleanup cycle.
