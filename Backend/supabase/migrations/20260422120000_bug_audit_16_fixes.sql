-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Migration: 20260422120000_bug_audit_16_fixes.sql
-- Remediates 16 confirmed bugs across the Supabase stack.

-- ============================================================
-- BUG 1 & 2: dismiss_recruit uses wrong column names
-- drivers.recruits PK is player_tag, not tag.
-- recruit_blacklist PK is player_tag, not tag.
-- ============================================================
CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(p_tag text, p_days_to_ban integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'drivers', 'substrate', 'public'
AS $$
DECLARE
    v_recruit RECORD;
BEGIN
    SELECT * INTO v_recruit FROM drivers.recruits WHERE player_tag = p_tag;

    INSERT INTO drivers.recruit_blacklist (
        player_tag,
        player_name,
        raw_potential_score,
        reason,
        expires_at
    )
    VALUES (
        p_tag,
        v_recruit.player_name,
        COALESCE(v_recruit.raw_potential_score, 0.0),
        'DISMISSED',
        NOW() + (p_days_to_ban || ' days')::INTERVAL
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        created_at = NOW();

    DELETE FROM drivers.recruits WHERE player_tag = p_tag;
END;
$$;

-- ============================================================
-- BUG 3: handle_recruit_event is an orphan duplicate of
-- handle_recruit_buffer. It also references wrong columns
-- (tag vs player_tag). Drop it entirely.
-- ============================================================
DROP FUNCTION IF EXISTS drivers.handle_recruit_event() CASCADE;

-- ============================================================
-- BUG 4: shred_war_log stores clan tag + name into
-- war_history.player_tag / player_name - semantically wrong.
-- war_history is a clan standings log; column names are correct
-- but the INSERT source fields were mislabelled.
-- Fix: extract clan tag and clan name correctly.
-- Also add SET search_path (Bug 5).
-- ============================================================
CREATE OR REPLACE FUNCTION substrate.shred_war_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
BEGIN
    INSERT INTO drivers.war_history (player_tag, player_name, week_id, fame, rank, clan_points)
    SELECT
        (standing->'clan'->>'tag')::TEXT,
        (standing->'clan'->>'name')::TEXT,
        (item->>'seasonId')::TEXT || '-' || (item->>'sectionIndex')::TEXT,
        (standing->'clan'->>'fame')::INTEGER,
        (standing->>'rank')::INTEGER,
        (standing->'clan'->>'clanScore')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE (standing->'clan'->>'tag') IS NOT NULL
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        player_name  = EXCLUDED.player_name,
        fame         = EXCLUDED.fame,
        rank         = EXCLUDED.rank,
        clan_points  = EXCLUDED.clan_points,
        updated_at   = NOW();

    RETURN NEW;
END;
$$;

-- ============================================================
-- BUG 5–12: Mutable search_path on 8 critical functions.
-- All functions that cross schema boundaries must pin
-- search_path to prevent search_path injection attacks.
-- ============================================================

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
BEGIN
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT m->>'tag', m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies,
        donations, donations_received, clan_rank, last_seen_at, last_ingested_at
    )
    SELECT
        m->>'tag', m->>'name', m->>'role',
        (m->>'expLevel')::INT,
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'clanRank')::INT,
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        now()
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name        = EXCLUDED.player_name,
        role               = EXCLUDED.role,
        exp_level          = EXCLUDED.exp_level,
        trophies           = EXCLUDED.trophies,
        donations          = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        clan_rank          = EXCLUDED.clan_rank,
        last_seen_at       = EXCLUDED.last_seen_at,
        last_ingested_at   = now(),
        updated_at         = now();

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    current_season_id TEXT;
    target_week_id TEXT;
BEGIN
    SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
    FROM substrate.raw_war_log
    ORDER BY ingested_at DESC LIMIT 1;

    IF current_season_id IS NOT NULL THEN
        target_week_id := current_season_id || '-' || (NEW.payload->>'sectionIndex');
    ELSE
        target_week_id := to_char(now(), 'YYYY-"W"WW');
    END IF;

    INSERT INTO drivers.war_activity (
        player_tag, player_name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT
        p->>'tag', p->>'name', target_week_id, (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT, (p->>'decksUsedToday')::INT, (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        decks_used       = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame             = EXCLUDED.fame,
        updated_at       = now();

    UPDATE drivers.members m
    SET
        decks_used_today  = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame         = p.p_fame,
        last_ingested_at  = now()
    FROM (
        SELECT
            p->>'tag'              AS p_tag,
            (p->>'fame')::INT      AS p_fame,
            (p->>'decksUsed')::INT AS p_decks_used,
            (p->>'decksUsedToday')::INT AS p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.handle_heritage_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
BEGIN
    IF (TG_OP = 'DELETE') OR (NEW.is_active = FALSE AND OLD.is_active = TRUE) THEN
        INSERT INTO drivers.heritage_ledger (player_tag, player_name, tenure_days, avg_fame, max_pes, last_seen_at)
        VALUES (
            COALESCE(OLD.player_tag, NEW.player_tag),
            COALESCE(OLD.player_name, NEW.player_name),
            EXTRACT(DAY FROM (NOW() - COALESCE(OLD.joined_at, NOW())))::INTEGER,
            COALESCE(OLD.week_fame, 0),
            0,
            NOW()
        )
        ON CONFLICT (player_tag) DO UPDATE SET
            player_name  = EXCLUDED.player_name,
            tenure_days  = EXCLUDED.tenure_days,
            avg_fame     = EXCLUDED.avg_fame,
            max_pes      = EXCLUDED.max_pes,
            last_seen_at = NOW();
    END IF;

    IF (TG_OP = 'DELETE') THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.on_telemetry_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    v_component_id TEXT;
    v_is_perfect   BOOLEAN;
BEGIN
    v_component_id := CASE NEW.event_type
        WHEN 'INGESTION_CYCLE'  THEN 'ROYALE_DATA_INGESTOR'
        WHEN 'HEADHUNTER_SCAN'  THEN 'HEADHUNTER_SCANNER'
        ELSE NULL
    END;

    IF v_component_id IS NOT NULL AND (NEW.status = 'SUCCESS' OR NEW.status = 'COMPLETE') THEN
        v_is_perfect := substrate.verify_run_integrity(NEW.id);

        UPDATE substrate.pipeline_heartbeat
        SET
            is_data_perfect        = v_is_perfect,
            last_validation_report = jsonb_build_object(
                'telemetry_id', NEW.id,
                'verified_at',  now(),
                'checks_passed', v_is_perfect
            )
        WHERE component_id = v_component_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.verify_run_integrity(p_telemetry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    v_audit_log  JSONB;
    v_is_perfect BOOLEAN := TRUE;
    v_entry      JSONB;
BEGIN
    SELECT metadata->'audit_log' INTO v_audit_log
    FROM substrate.governance_telemetry
    WHERE id = p_telemetry_id;

    IF v_audit_log IS NULL OR jsonb_array_length(v_audit_log) = 0 THEN
        RETURN FALSE;
    END IF;

    FOR v_entry IN SELECT * FROM jsonb_array_elements(v_audit_log)
    LOOP
        IF v_entry->>'action' = 'resulted_data' THEN
            IF (v_entry->'details'->>'is_100_percent_match')::BOOLEAN IS FALSE THEN
                v_is_perfect := FALSE;
                EXIT;
            END IF;
        END IF;

        IF v_entry->>'action' = 'error' THEN
            v_is_perfect := FALSE;
            EXIT;
        END IF;
    END LOOP;

    RETURN v_is_perfect;
END;
$$;

CREATE OR REPLACE FUNCTION drivers.log_recruit_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'drivers', 'substrate', 'public'
AS $$
DECLARE
    v_delta NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, new_score, description)
        VALUES (NEW.player_tag, NEW.player_name, 'DISCOVERED', NEW.raw_potential_score, 'Initial discovery via sensory mesh.');

        IF (NEW.status = 'ACTIVE') THEN
            INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
            VALUES (NEW.player_tag, NEW.player_name, 'PROMOTED', 'Direct entry into ACTIVE status.');
        END IF;
        RETURN NEW;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        IF (NEW.status <> OLD.status) THEN
            IF (NEW.status = 'ACTIVE') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'PROMOTED', 'Promoted to ACTIVE rotation.');
            ELSIF (OLD.status = 'ACTIVE' AND NEW.status = 'BENCHED') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'BENCHED', 'Rotated out of ACTIVE status to BENCHED.');
            ELSIF (OLD.status = 'ACTIVE' AND NEW.status = 'QUEUE') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'ROTATED_OUT', 'Moved from ACTIVE back to QUEUE.');
            ELSIF (NEW.status = 'ARCHIVED') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'ARCHIVED', 'Recruit archived/retired.');
            END IF;
        END IF;

        IF (NEW.raw_potential_score <> OLD.raw_potential_score) THEN
            v_delta := ABS(NEW.raw_potential_score - OLD.raw_potential_score) / NULLIF(OLD.raw_potential_score, 0);
            IF (v_delta >= 0.05 OR (OLD.raw_potential_score = 0 AND NEW.raw_potential_score > 0)) THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
                VALUES (
                    NEW.player_tag, NEW.player_name, 'SCORE_THRESHOLD_HIT',
                    OLD.raw_potential_score, NEW.raw_potential_score,
                    'Significant performance shift detected (' || ROUND(v_delta * 100, 1) || '% change).'
                );
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION drivers.handle_recruit_buffer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'drivers', 'substrate', 'public'
AS $$
DECLARE
    v_target_recruit RECORD;
    v_ledger_event   TEXT;
BEGIN
    DELETE FROM drivers.recruit_blacklist WHERE expires_at < NOW();

    SELECT * INTO v_target_recruit FROM drivers.recruits WHERE player_tag = NEW.player_tag;

    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        v_ledger_event := CASE
            WHEN NEW.event_type = 'INVITED'   THEN 'ACTION_INVITED'
            WHEN NEW.event_type = 'DISCARDED' THEN 'ACTION_DISCARDED'
        END;

        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, new_score, description)
        VALUES (
            NEW.player_tag,
            COALESCE(v_target_recruit.player_name, NEW.metadata->>'name', 'Unknown'),
            v_ledger_event,
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            'Manual user action processed via RAM buffer.'
        );

        INSERT INTO drivers.recruit_blacklist (
            player_tag, player_name, raw_potential_score, snapshot, reason, expires_at
        )
        VALUES (
            NEW.player_tag,
            COALESCE(v_target_recruit.player_name, NEW.metadata->>'name', 'Unknown'),
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            COALESCE(to_jsonb(v_target_recruit), NEW.metadata),
            NEW.event_type,
            NOW() + INTERVAL '30 days'
        )
        ON CONFLICT (player_tag) DO UPDATE SET
            expires_at          = EXCLUDED.expires_at,
            reason              = EXCLUDED.reason,
            player_name         = COALESCE(EXCLUDED.player_name, recruit_blacklist.player_name),
            raw_potential_score = COALESCE(EXCLUDED.raw_potential_score, recruit_blacklist.raw_potential_score),
            snapshot            = EXCLUDED.snapshot;

        DELETE FROM drivers.recruits WHERE player_tag = NEW.player_tag;
    END IF;

    DELETE FROM drivers.recruit_buffer WHERE id = NEW.id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.rotate_recruits()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
DECLARE
    limit_val  INT;
    v_benched  INT;
    v_promoted INT;
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('RECRUIT_ROTATION', 'RUNNING', NOW(), 'Rotation cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status = 'RUNNING', last_triggered_at = EXCLUDED.last_triggered_at, last_message = EXCLUDED.last_message;

    SELECT value::INT INTO limit_val FROM substrate.config WHERE key = 'MAX_ACTIVE_RECRUITS';

    CREATE TEMP TABLE elite_tags ON COMMIT DROP AS
    SELECT player_tag FROM drivers.recruits
    WHERE status != 'ARCHIVED'
    ORDER BY raw_potential_score DESC NULLS LAST
    LIMIT limit_val;

    WITH benched_rows AS (
        UPDATE drivers.recruits
        SET status = 'BENCHED'::drivers.recruit_status
        WHERE status = 'ACTIVE'::drivers.recruit_status
          AND player_tag NOT IN (SELECT player_tag FROM elite_tags)
        RETURNING player_tag
    )
    SELECT count(*) INTO v_benched FROM benched_rows;

    WITH promoted_rows AS (
        UPDATE drivers.recruits
        SET status = 'ACTIVE'::drivers.recruit_status
        WHERE player_tag IN (SELECT player_tag FROM elite_tags)
          AND status != 'ACTIVE'::drivers.recruit_status
        RETURNING player_tag
    )
    SELECT count(*) INTO v_promoted FROM promoted_rows;

    UPDATE substrate.pipeline_heartbeat
    SET status           = 'COMPLETED',
        last_success_at  = NOW(),
        last_message     = 'Rotation successful: ' || v_promoted || ' promoted, ' || v_benched || ' benched.',
        updated_at       = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';

EXCEPTION WHEN OTHERS THEN
    UPDATE substrate.pipeline_heartbeat
    SET status          = 'FAILED',
        last_failure_at = NOW(),
        last_message    = SQLERRM,
        updated_at      = NOW()
    WHERE component_id = 'RECRUIT_ROTATION';
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION substrate.tr_fn_rotate_recruits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
    PERFORM substrate.rotate_recruits();
    RETURN NULL;
END;
$$;

-- ============================================================
-- BUG 13: SECURITY DEFINER views expose creator privileges.
-- All features.* views and substrate.view_pipeline_health
-- must be recreated WITHOUT security_definer (the default
-- SECURITY INVOKER is correct for RLS-backed views).
-- We do this by dropping and recreating only the definer flag;
-- the view SQL is unchanged.
-- ============================================================

-- features.roster_view
DROP VIEW IF EXISTS features.roster_view CASCADE;
CREATE VIEW features.roster_view
WITH (security_invoker = true)
AS
SELECT
    m.player_tag,
    m.player_name,
    m.role,
    m.exp_level,
    m.trophies,
    m.donations,
    m.donations_received,
    m.clan_rank,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    m.last_seen_at,
    m.last_ingested_at,
    substrate.format_last_seen(EXTRACT(EPOCH FROM (now() - m.last_seen_at)) / 86400.0)  AS last_seen_label,
    substrate.format_last_seen(EXTRACT(EPOCH FROM (now() - m.last_ingested_at)) / 86400.0) AS last_ingested_label
FROM drivers.members m;

-- features.headhunter_view
DROP VIEW IF EXISTS features.headhunter_view CASCADE;
CREATE VIEW features.headhunter_view
WITH (security_invoker = true)
AS
SELECT
    r.player_tag,
    r.player_name,
    r.trophies,
    r.donations,
    r.war_wins,
    r.raw_potential_score,
    r.source,
    r.status,
    r.found_date,
    r.last_scan
FROM drivers.recruits r
WHERE r.status != 'ARCHIVED';

-- features.scoring_view
DROP VIEW IF EXISTS features.scoring_view CASCADE;
CREATE VIEW features.scoring_view
WITH (security_invoker = true)
AS
SELECT
    m.player_tag,
    m.player_name,
    m.trophies,
    m.donations,
    m.donations_received,
    m.week_fame,
    m.decks_used_weekly,
    m.clan_rank,
    (
        (COALESCE(m.trophies, 0)           * 1.0)  +
        (COALESCE(m.donations, 0)          * 0.5)  +
        (COALESCE(m.week_fame, 0)          * 2.0)  +
        (COALESCE(m.decks_used_weekly, 0)  * 10.0)
    ) AS performance_score
FROM drivers.members m;

-- features.war_activity_view
DROP VIEW IF EXISTS features.war_activity_view CASCADE;
CREATE VIEW features.war_activity_view
WITH (security_invoker = true)
AS
SELECT
    wa.player_tag,
    wa.player_name,
    wa.week_id,
    wa.section_index,
    wa.decks_used,
    wa.decks_used_today,
    wa.fame,
    wa.updated_at
FROM drivers.war_activity wa;

-- features.war_loyalty_view
DROP VIEW IF EXISTS features.war_loyalty_view CASCADE;
CREATE VIEW features.war_loyalty_view
WITH (security_invoker = true)
AS
SELECT
    wh.player_tag,
    wh.player_name,
    wh.week_id,
    wh.fame,
    wh.rank,
    wh.clan_points,
    wh.updated_at
FROM drivers.war_history wh;

-- features.governance_report
DROP VIEW IF EXISTS features.governance_report CASCADE;
CREATE VIEW features.governance_report
WITH (security_invoker = true)
AS
SELECT
    gt.id,
    gt.event_type,
    gt.status,
    gt.message,
    gt.metadata,
    gt.created_at
FROM substrate.governance_telemetry gt
ORDER BY gt.created_at DESC;

-- features.tactical_awareness_view
DROP VIEW IF EXISTS features.tactical_awareness_view CASCADE;
CREATE VIEW features.tactical_awareness_view
WITH (security_invoker = true)
AS
SELECT
    m.player_tag,
    m.player_name,
    m.trophies,
    m.week_fame,
    m.decks_used_today,
    m.decks_used_weekly,
    m.last_seen_at,
    substrate.format_last_seen(EXTRACT(EPOCH FROM (now() - m.last_seen_at)) / 86400.0) AS last_seen_label
FROM drivers.members m;

-- substrate.view_pipeline_health
DROP VIEW IF EXISTS substrate.view_pipeline_health CASCADE;
CREATE VIEW substrate.view_pipeline_health
WITH (security_invoker = true)
AS
SELECT
    ph.component_id,
    ph.status,
    ph.last_triggered_at,
    ph.last_success_at,
    ph.last_failure_at,
    ph.last_message,
    ph.is_data_perfect,
    ph.last_validation_report,
    ph.updated_at
FROM substrate.pipeline_heartbeat ph;

-- ============================================================
-- BUG 14: RLS enabled but NO policies on 3 substrate tables.
-- These tables are internal-only; lock them to service_role.
-- ============================================================

-- substrate.raw_river_race
DROP POLICY IF EXISTS "Internal Service Access" ON substrate.raw_river_race;
CREATE POLICY "Internal Service Access"
    ON substrate.raw_river_race
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- substrate.raw_scout_logs
DROP POLICY IF EXISTS "Internal Service Access" ON substrate.raw_scout_logs;
CREATE POLICY "Internal Service Access"
    ON substrate.raw_scout_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- substrate.raw_war_log
DROP POLICY IF EXISTS "Internal Service Access" ON substrate.raw_war_log;
CREATE POLICY "Internal Service Access"
    ON substrate.raw_war_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- drivers.recruit_buffer
DROP POLICY IF EXISTS "Internal Service Access" ON drivers.recruit_buffer;
CREATE POLICY "Internal Service Access"
    ON drivers.recruit_buffer
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- BUG 15: drivers.clans has 3 overlapping permissive policies
-- for the same roles/actions causing double policy evaluation.
-- Consolidate: drop Backend Management Access (redundant with
-- Restricted Access Driver), keep Public Read Access for SELECT
-- and Restricted Access Driver for write ops.
-- ============================================================
DROP POLICY IF EXISTS "Backend Management Access" ON drivers.clans;

-- ============================================================
-- BUG 16: drivers.members has overlapping SELECT policies
-- for authenticated (Public Read Access + Restricted Access Driver).
-- Keep only one authoritative policy; the Restricted Access Driver
-- covers all operations so Public Read Access is redundant.
-- ============================================================
DROP POLICY IF EXISTS "Public Read Access" ON drivers.members;
