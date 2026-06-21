-- Migration: 20260620142000_headhunter_epoch_guard
-- Introduces the Headhunter Top-50 Safety Epoch Loop.
--
-- [CONTEXT] The headhunter scanner runs every 30 minutes via pg_cron. If a scan
-- produces zero recruits landing in the visible top-50 pool, the headhunter view
-- stagnates for 30 minutes. This migration closes that gap by adding an epoch
-- guard: a lightweight pg_cron job that ticks every 5 minutes and re-triggers
-- the scanner when the previous run yielded no top-50 recruits, up to a
-- configurable maximum number of retries within a hard wall-clock window.
--
-- [ARCHITECTURE] The guard is orchestrated entirely in SQL (no new Edge Function).
-- This matches the existing pattern where substrate.run_headhunter_scanner()
-- already drives the main scanner via net.http_post.
--
-- [NO MAGIC NUMBERS] All thresholds are stored as rows in substrate.config so
-- they can be adjusted post-deploy without a migration or code change.
--
-- Components added:
--   1. substrate.headhunter_epoch_state  - singleton ephemeral state table
--   2. substrate.config rows             - epoch configuration keys
--   3. substrate.update_epoch_state()    - called by the Edge Function after each scan
--   4. public.update_epoch_state()       - PostgREST-accessible RPC wrapper
--   5. substrate.run_headhunter_epoch_guard() - pg_cron guard function
--   6. cron.schedule()                   - 5-minute epoch guard tick

BEGIN;

-- ============================================================
-- 1. EPOCH STATE TABLE
-- Singleton row tracking the current epoch loop state.
-- epoch_count is reset to 0 at the start of each new 30-min main cycle.
-- ============================================================
CREATE TABLE IF NOT EXISTS substrate.headhunter_epoch_state (
    id                 integer      NOT NULL DEFAULT 1,
    last_main_scan_at  timestamptz,
    epoch_count        integer      NOT NULL DEFAULT 0,
    last_top50_count   integer      NOT NULL DEFAULT 0,
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT headhunter_epoch_state_pkey PRIMARY KEY (id),
    CONSTRAINT headhunter_epoch_state_singleton CHECK (id = 1)
);

ALTER TABLE substrate.headhunter_epoch_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE substrate.headhunter_epoch_state IS
    'Singleton row tracking the headhunter top-50 epoch retry loop state. '
    'Maintained by substrate.update_epoch_state() and consumed by '
    'substrate.run_headhunter_epoch_guard().';

COMMENT ON COLUMN substrate.headhunter_epoch_state.epoch_count IS
    'Number of epoch retries fired in the current 30-minute cycle. '
    'Resets to 0 when a scan succeeds (top50 >= 1) or the epoch window expires.';

COMMENT ON COLUMN substrate.headhunter_epoch_state.last_top50_count IS
    'The new_recruits_top50 value reported by the most recent scanner run.';

-- Seed the singleton row (safe to run multiple times)
INSERT INTO substrate.headhunter_epoch_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. EPOCH CONFIGURATION KEYS
-- Stored in substrate.config (existing SSOT for system toggles).
-- Units: epoch counts are integers, delays/windows are seconds.
-- ============================================================
INSERT INTO substrate.config (key, value, description) VALUES
    (
        'EPOCH_MAX_RETRIES',
        '3',
        'Maximum number of epoch retries the guard will fire per 30-minute main scan cycle.'
    ),
    (
        'EPOCH_INTER_DELAY_S',
        '300',
        'Minimum seconds between epoch guard fires (must match or exceed the pg_cron tick interval of 5 min).'
    ),
    (
        'EPOCH_WINDOW_S',
        '900',
        'Hard wall-clock deadline in seconds from last_main_scan_at beyond which the guard will not fire. '
        'Must be strictly less than the main scanner cadence (1800 s / 30 min).'
    )
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 3. substrate.update_epoch_state(p_top50 integer)
-- Called by the headhunter-scanner Edge Function at the end of each run.
-- Classifies the run as either a main cycle start or an epoch retry,
-- then updates the singleton state accordingly.
-- ============================================================
CREATE OR REPLACE FUNCTION substrate.update_epoch_state(p_top50 integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_state         substrate.headhunter_epoch_state%ROWTYPE;
    v_window_s      integer;
    v_in_window     boolean;
BEGIN
    -- Read the current epoch window config
    SELECT value::integer INTO v_window_s
    FROM substrate.config
    WHERE key = 'EPOCH_WINDOW_S';

    v_window_s := COALESCE(v_window_s, 900);

    -- Lock and read the singleton state row
    SELECT * INTO v_state
    FROM substrate.headhunter_epoch_state
    WHERE id = 1
    FOR UPDATE;

    -- Determine whether this run is within the current epoch window
    v_in_window := (
        v_state.last_main_scan_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (now() - v_state.last_main_scan_at)) <= v_window_s
    );

    IF NOT v_in_window THEN
        -- [DECISION] This is a new main cycle start (first scan of the 30-min window).
        -- Reset epoch_count and record the new cycle anchor.
        UPDATE substrate.headhunter_epoch_state SET
            last_main_scan_at = now(),
            epoch_count       = 0,
            last_top50_count  = p_top50,
            updated_at        = now()
        WHERE id = 1;

        INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
        VALUES (
            'HEADHUNTER_EPOCH',
            'CYCLE_START',
            'New epoch cycle started. epoch_count reset to 0.',
            jsonb_build_object('new_recruits_top50', p_top50)
        );
    ELSE
        -- [DECISION] This is an epoch retry completing within the window.
        -- Update top50 result only; epoch_count is incremented by the guard before firing.
        UPDATE substrate.headhunter_epoch_state SET
            last_top50_count = p_top50,
            updated_at       = now()
        WHERE id = 1;

        INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
        VALUES (
            'HEADHUNTER_EPOCH',
            CASE WHEN p_top50 >= 1 THEN 'EPOCH_SUCCESS' ELSE 'EPOCH_MISS' END,
            CASE WHEN p_top50 >= 1
                THEN 'Epoch scan found top-50 recruit(s). Guard armed disarmed for this cycle.'
                ELSE 'Epoch scan found no top-50 recruits. Guard remains armed.'
            END,
            jsonb_build_object(
                'new_recruits_top50', p_top50,
                'epoch_count',        v_state.epoch_count
            )
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: telemetry failure must not abort the scanner run
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('HEADHUNTER_EPOCH', 'ERROR', 'update_epoch_state failed: ' || SQLERRM);
END;
$function$;

COMMENT ON FUNCTION substrate.update_epoch_state(integer) IS
    'Called by the headhunter-scanner Edge Function at the end of every scan run. '
    'Classifies the run as a new main cycle or an epoch retry and updates '
    'substrate.headhunter_epoch_state accordingly.';

-- ============================================================
-- 4. public.update_epoch_state(p_top50 integer)
-- PostgREST-accessible RPC bridge so the Edge Function can call
-- supabase.rpc("update_epoch_state", { p_top50: ... }).
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_epoch_state(p_top50 integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'substrate', 'pg_temp'
AS $function$
BEGIN
    PERFORM substrate.update_epoch_state(p_top50);
END;
$function$;

COMMENT ON FUNCTION public.update_epoch_state(integer) IS
    'Public RPC bridge for substrate.update_epoch_state. '
    'Required by headhunter-scanner Edge Function which calls supabase.rpc() '
    'and can only reach the public schema via PostgREST.';

-- ============================================================
-- 5. substrate.run_headhunter_epoch_guard()
-- Invoked every 5 minutes by pg_cron.
-- Reads the epoch state and config; fires the scanner if and only if:
--   - last_top50_count = 0 (previous scan missed the top-50)
--   - epoch_count < EPOCH_MAX_RETRIES
--   - time since last_main_scan_at <= EPOCH_WINDOW_S
-- ============================================================
CREATE OR REPLACE FUNCTION substrate.run_headhunter_epoch_guard()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_state         substrate.headhunter_epoch_state%ROWTYPE;
    v_max_retries   integer;
    v_window_s      integer;
    v_elapsed_s     numeric;
    v_token         text;
BEGIN
    -- Read config (defaults protect against missing rows)
    SELECT value::integer INTO v_max_retries FROM substrate.config WHERE key = 'EPOCH_MAX_RETRIES';
    SELECT value::integer INTO v_window_s    FROM substrate.config WHERE key = 'EPOCH_WINDOW_S';

    v_max_retries := COALESCE(v_max_retries, 3);
    v_window_s    := COALESCE(v_window_s,    900);

    -- Read and lock the singleton state row
    SELECT * INTO v_state
    FROM substrate.headhunter_epoch_state
    WHERE id = 1
    FOR UPDATE;

    -- [GUARD] No-op conditions: bail early without logging noise
    IF v_state.last_main_scan_at IS NULL THEN
        -- No main scan has ever run; nothing to retry
        RETURN;
    END IF;

    v_elapsed_s := EXTRACT(EPOCH FROM (now() - v_state.last_main_scan_at));

    IF v_elapsed_s > v_window_s THEN
        -- Outside the epoch window; the guard is idle until the next main scan
        RETURN;
    END IF;

    IF v_state.last_top50_count >= 1 THEN
        -- Previous scan already landed a top-50 recruit; guard is satisfied
        RETURN;
    END IF;

    IF v_state.epoch_count >= v_max_retries THEN
        -- Epoch budget exhausted for this cycle; guard is disarmed
        INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
        VALUES (
            'HEADHUNTER_EPOCH',
            'BUDGET_EXHAUSTED',
            'Epoch retry budget exhausted. Guard will remain idle until the next main scan cycle.',
            jsonb_build_object(
                'epoch_count',    v_state.epoch_count,
                'max_retries',    v_max_retries,
                'elapsed_s',      v_elapsed_s,
                'window_s',       v_window_s
            )
        );
        RETURN;
    END IF;

    -- [ACTION] All guards passed; pre-increment epoch_count and fire the scanner
    UPDATE substrate.headhunter_epoch_state SET
        epoch_count = epoch_count + 1,
        updated_at  = now()
    WHERE id = 1;

    v_token := substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');

    PERFORM net.http_post(
        url     := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer ' || v_token
        ),
        body    := '{"tournaments": ["AUTO"]}'::jsonb
    );

    INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
    VALUES (
        'HEADHUNTER_EPOCH',
        'EPOCH_FIRED',
        'Epoch retry ' || (v_state.epoch_count + 1) || ' of ' || v_max_retries || ' fired.',
        jsonb_build_object(
            'epoch_number', v_state.epoch_count + 1,
            'max_retries',  v_max_retries,
            'elapsed_s',    v_elapsed_s,
            'window_s',     v_window_s
        )
    );

EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('HEADHUNTER_EPOCH', 'ERROR', 'run_headhunter_epoch_guard failed: ' || SQLERRM);
END;
$function$;

COMMENT ON FUNCTION substrate.run_headhunter_epoch_guard() IS
    'pg_cron guard function. Ticks every 5 minutes and re-triggers the headhunter-scanner '
    'Edge Function when the previous scan produced no top-50 recruits, subject to '
    'EPOCH_MAX_RETRIES and EPOCH_WINDOW_S config constraints.';

-- ============================================================
-- 6. pg_cron SCHEDULE
-- Ticks every 5 minutes. The guard function itself is idempotent
-- and fast-exits when no action is required.
-- ============================================================
SELECT cron.schedule(
    'headhunter-epoch-guard',
    '*/5 * * * *',
    $$SELECT substrate.run_headhunter_epoch_guard()$$
);

COMMIT;
