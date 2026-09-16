-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Two independent fixes:
--
-- 1. drivers.member_snapshots had no writer anywhere in the codebase (the
--    9/16 cleanup emptied it entirely, since every row was backfill debris
--    older than its 90-day retention). substrate.shred_clan_members() already
--    fires on every roster ingestion (every 30 min) and already has each
--    member's trophies/donations/last_seen in hand, so it now also captures
--    one snapshot per member per real calendar day there -- driven by actual
--    ingestion events, not a new blind-schedule cron job.
--
-- 2. Resource-pressure early warning. Host-level CPU/swap isn't visible from
--    SQL, but connection saturation and total DB size are visible proxies for
--    the same free-tier memory ceiling that caused the 9/16 outage. Wired
--    into the existing pipeline_watchdog cadence (already cron'd every 10
--    minutes) instead of adding a new scheduled job, and logged into the
--    existing governance_telemetry trail with a cooldown so a sustained
--    breach doesn't spam it. Rationale in the commit message.

BEGIN;

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_clan_tag TEXT;
    v_recruit_tag TEXT;
BEGIN
    -- Identify the target clan
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- 1. UPSERT participants into universal players registry first to satisfy FKs
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT
        m->>'tag',
        m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. UPSERT current members into drivers.members
    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies,
        donations, donations_received, clan_rank, last_seen_at,
        last_ingested_at, is_active, updated_at, current_clan_tag
    )
    SELECT
        m->>'tag',
        m->>'name',
        m->>'role',
        (m->>'expLevel')::INT,
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'clanRank')::INT,
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        now(),
        TRUE,
        now(),
        v_clan_tag
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name          = EXCLUDED.player_name,
        role                 = EXCLUDED.role,
        exp_level            = EXCLUDED.exp_level,
        trophies             = EXCLUDED.trophies,
        donations            = EXCLUDED.donations,
        donations_received   = EXCLUDED.donations_received,
        clan_rank            = EXCLUDED.clan_rank,
        -- [FIX] Monotonic guard: never allow last_seen_at to move backwards.
        -- The CR API lastSeen field is event-triggered, not polled. A sync may
        -- return an older timestamp than what is already stored (API cache lag).
        -- GREATEST ensures we keep the most recent known activity timestamp.
        last_seen_at         = GREATEST(drivers.members.last_seen_at, EXCLUDED.last_seen_at),
        last_ingested_at     = EXCLUDED.last_ingested_at,
        is_active            = TRUE,
        current_clan_tag     = EXCLUDED.current_clan_tag,
        updated_at           = now();

    -- 2.5. Capture today's daily snapshot for growth/trend tracking. Fires
    -- once per member per calendar day: only the first ingestion of the day
    -- inserts a row, later same-day ingestions are no-ops via ON CONFLICT.
    INSERT INTO drivers.member_snapshots (
        player_tag, trophies, donations, donations_received, last_seen,
        snapshot_date, snapshot_at
    )
    SELECT
        m->>'tag',
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        CURRENT_DATE,
        now()
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag, snapshot_date) DO NOTHING;

    -- 3. DEACTIVATE LEAVERS
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND current_clan_tag = v_clan_tag
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM jsonb_array_elements(NEW.payload->'items') AS elem
      );

    -- 4. CLEANUP RECRUITS (Harmonization)
    -- If an active member is found in the recruits table, they have "joined us".
    -- We delete them from the active recruitment pool and log the event.
    FOR v_recruit_tag IN
        SELECT r.player_tag
        FROM drivers.recruits r
        JOIN jsonb_array_elements(NEW.payload->'items') AS m ON (m->>'tag' = r.player_tag)
    LOOP
        -- Log the transition
        INSERT INTO drivers.recruit_ledger (player_tag, event_type, description)
        VALUES (v_recruit_tag, 'JOINED_US', 'Recruit detected in active roster payload.');

        -- Delete from recruits
        DELETE FROM drivers.recruits WHERE player_tag = v_recruit_tag;
    END LOOP;

    RETURN NEW;
END;
$function$;

INSERT INTO substrate.config (key, value, description) VALUES
    ('CONN_WARN_PCT', '70',
     'Connections as a percent of max_connections that triggers a RESOURCE_PRESSURE warning.'),
    ('DB_SIZE_WARN_MB', '400',
     'Total database size (MB) that triggers a RESOURCE_PRESSURE warning. Free-tier compute is memory-constrained regardless of disk headroom, so this is set relative to the ~235MB post-cleanup baseline, not the 8GB disk quota.'),
    ('RESOURCE_ALERT_COOLDOWN_HOURS', '6',
     'Minimum hours between repeated RESOURCE_PRESSURE warnings of the same kind.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION substrate.check_resource_pressure()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_conn_count integer;
    v_max_conn integer;
    v_conn_warn_pct integer;
    v_db_size_mb numeric;
    v_db_size_warn_mb integer;
    v_cooldown_hours integer;
BEGIN
    v_conn_warn_pct   := COALESCE(substrate.config_int('CONN_WARN_PCT'), 70);
    v_db_size_warn_mb := COALESCE(substrate.config_int('DB_SIZE_WARN_MB'), 400);
    v_cooldown_hours  := COALESCE(substrate.config_int('RESOURCE_ALERT_COOLDOWN_HOURS'), 6);

    SELECT count(*) INTO v_conn_count FROM pg_stat_activity;
    SELECT setting::integer INTO v_max_conn FROM pg_settings WHERE name = 'max_connections';

    IF v_conn_count::numeric / v_max_conn::numeric * 100 >= v_conn_warn_pct
       AND NOT EXISTS (
           SELECT 1 FROM substrate.governance_telemetry
           WHERE event_type = 'RESOURCE_PRESSURE'
             AND message ILIKE 'Connections at%'
             AND created_at > now() - (v_cooldown_hours || ' hours')::interval
       )
    THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('RESOURCE_PRESSURE', 'WARNING',
                'Connections at ' || v_conn_count || '/' || v_max_conn ||
                ' (' || round(v_conn_count::numeric / v_max_conn::numeric * 100) ||
                '%), at or above the ' || v_conn_warn_pct || '% warning threshold.');
    END IF;

    SELECT pg_database_size(current_database())::numeric / (1024 * 1024) INTO v_db_size_mb;

    IF v_db_size_mb >= v_db_size_warn_mb
       AND NOT EXISTS (
           SELECT 1 FROM substrate.governance_telemetry
           WHERE event_type = 'RESOURCE_PRESSURE'
             AND message ILIKE 'Database size%'
             AND created_at > now() - (v_cooldown_hours || ' hours')::interval
       )
    THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('RESOURCE_PRESSURE', 'WARNING',
                'Database size ' || round(v_db_size_mb) || ' MB is at or above the ' ||
                v_db_size_warn_mb || ' MB warning threshold (free-tier compute is memory-constrained; ' ||
                'review retention settings in substrate.config or consider a compute upgrade).');
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION substrate.check_resource_pressure() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION substrate.check_resource_pressure() TO service_role;

-- Wire into the existing watchdog cadence (already runs every 10 minutes via
-- cron job 33) instead of adding a new scheduled job. Isolated in its own
-- block so a failure here cannot break the watchdog's primary lease-timeout
-- responsibility.
CREATE OR REPLACE FUNCTION substrate.pipeline_watchdog()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_reset_count integer;
BEGIN
    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = now(),
        last_message    = 'Watchdog timeout: Pipeline exceeded its 15-minute execution lease.',
        updated_at      = now()
    WHERE status = 'RUNNING'
      AND last_triggered_at < now() - interval '15 minutes';

    GET DIAGNOSTICS v_reset_count = ROW_COUNT;

    IF v_reset_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES (
            'WATCHDOG_INTERVENTION',
            'WARNING',
            'Watchdog marked ' || v_reset_count || ' pipeline lease(s) as failed.'
        );
    END IF;

    BEGIN
        PERFORM substrate.check_resource_pressure();
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'ERROR', 'Resource pressure check failed: ' || SQLERRM);
    END;

    RETURN v_reset_count;
END;
$function$;

COMMIT;
