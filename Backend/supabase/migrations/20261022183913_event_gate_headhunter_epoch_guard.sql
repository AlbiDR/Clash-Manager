-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Keep the quality retry loop available when a scan genuinely needs it, but do
-- not poll it all day or start it in the same minute as ingestion and maintenance.

BEGIN;

SET LOCAL lock_timeout = '3s';

INSERT INTO substrate.config (key, value, description) VALUES
    ('EPOCH_GUARD_SCHEDULE', '2,22,27,32,52,57 * * * *',
     'Retry slots for headhunter-epoch-guard while a scan has an eligible retry. They provide up to three post-main-scan attempts while avoiding ingestion, scanner, watchdog and rotation cron minutes.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION substrate.sync_headhunter_epoch_guard_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_jobid       bigint;
    v_state       substrate.headhunter_epoch_state%ROWTYPE;
    v_max_retries integer;
    v_window_s    integer;
    v_schedule    text;
    v_armed       boolean;
BEGIN
    SELECT jobid INTO v_jobid
    FROM cron.job
    WHERE jobname = 'headhunter-epoch-guard';
    IF v_jobid IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_state
    FROM substrate.headhunter_epoch_state
    WHERE id = 1;

    SELECT value::integer INTO v_max_retries
    FROM substrate.config
    WHERE key = 'EPOCH_MAX_RETRIES';
    SELECT value::integer INTO v_window_s
    FROM substrate.config
    WHERE key = 'EPOCH_WINDOW_S';
    SELECT value INTO v_schedule
    FROM substrate.config
    WHERE key = 'EPOCH_GUARD_SCHEDULE';

    v_max_retries := COALESCE(v_max_retries, 3);
    v_window_s := COALESCE(v_window_s, 900);
    v_schedule := COALESCE(v_schedule, '2,22,27,32,52,57 * * * *');
    v_armed := v_state.last_main_scan_at IS NOT NULL
        AND now() - v_state.last_main_scan_at <= make_interval(secs => v_window_s)
        AND v_state.last_top50_count < 1
        AND v_state.epoch_count < v_max_retries;

    PERFORM cron.alter_job(v_jobid, schedule := v_schedule, active := v_armed);
END;
$function$;

COMMENT ON FUNCTION substrate.sync_headhunter_epoch_guard_job() IS
'Keeps headhunter-epoch-guard dormant unless the current scan window has an eligible retry. When awake it runs on EPOCH_GUARD_SCHEDULE, intentionally offset from the heavy ingestion, scanner, watchdog and recruit-rotation cron minutes.';

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
    SELECT value::integer INTO v_window_s
    FROM substrate.config
    WHERE key = 'EPOCH_WINDOW_S';
    v_window_s := COALESCE(v_window_s, 900);

    SELECT * INTO v_state
    FROM substrate.headhunter_epoch_state
    WHERE id = 1
    FOR UPDATE;

    v_in_window := (
        v_state.last_main_scan_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (now() - v_state.last_main_scan_at)) <= v_window_s
    );

    IF NOT v_in_window THEN
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
        UPDATE substrate.headhunter_epoch_state SET
            last_top50_count = p_top50,
            updated_at       = now()
        WHERE id = 1;

        INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
        VALUES (
            'HEADHUNTER_EPOCH',
            CASE WHEN p_top50 >= 1 THEN 'EPOCH_SUCCESS' ELSE 'EPOCH_MISS' END,
            CASE WHEN p_top50 >= 1
                THEN 'Epoch scan found top-50 recruit(s). Guard disarmed for this cycle.'
                ELSE 'Epoch scan found no top-50 recruits. Guard remains armed while retry budget remains.'
            END,
            jsonb_build_object(
                'new_recruits_top50', p_top50,
                'epoch_count',        v_state.epoch_count
            )
        );
    END IF;

    PERFORM substrate.sync_headhunter_epoch_guard_job();
EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('HEADHUNTER_EPOCH', 'ERROR', 'update_epoch_state failed: ' || SQLERRM);
END;
$function$;

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
    SELECT value::integer INTO v_max_retries FROM substrate.config WHERE key = 'EPOCH_MAX_RETRIES';
    SELECT value::integer INTO v_window_s FROM substrate.config WHERE key = 'EPOCH_WINDOW_S';
    v_max_retries := COALESCE(v_max_retries, 3);
    v_window_s := COALESCE(v_window_s, 900);

    SELECT * INTO v_state
    FROM substrate.headhunter_epoch_state
    WHERE id = 1
    FOR UPDATE;

    IF v_state.last_main_scan_at IS NULL THEN
        PERFORM substrate.sync_headhunter_epoch_guard_job();
        RETURN;
    END IF;

    v_elapsed_s := EXTRACT(EPOCH FROM (now() - v_state.last_main_scan_at));
    IF v_elapsed_s > v_window_s OR v_state.last_top50_count >= 1 THEN
        PERFORM substrate.sync_headhunter_epoch_guard_job();
        RETURN;
    END IF;

    IF v_state.epoch_count >= v_max_retries THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
        VALUES (
            'HEADHUNTER_EPOCH',
            'BUDGET_EXHAUSTED',
            'Epoch retry budget exhausted. Guard will remain idle until the next main scan cycle.',
            jsonb_build_object(
                'epoch_count', v_state.epoch_count,
                'max_retries', v_max_retries,
                'elapsed_s', v_elapsed_s,
                'window_s', v_window_s
            )
        );
        PERFORM substrate.sync_headhunter_epoch_guard_job();
        RETURN;
    END IF;

    UPDATE substrate.headhunter_epoch_state SET
        epoch_count = epoch_count + 1,
        updated_at = now()
    WHERE id = 1;

    v_token := substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');
    PERFORM net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', substrate.get_vault_secret('SUPABASE_ANON_KEY'),
            'Authorization', 'Bearer ' || v_token
        ),
        body := '{"tournaments": ["AUTO"]}'::jsonb
    );

    INSERT INTO substrate.governance_telemetry (event_type, status, message, metadata)
    VALUES (
        'HEADHUNTER_EPOCH',
        'EPOCH_FIRED',
        'Epoch retry fired.',
        jsonb_build_object(
            'epoch_number', v_state.epoch_count + 1,
            'max_retries', v_max_retries,
            'elapsed_s', v_elapsed_s,
            'window_s', v_window_s
        )
    );

    PERFORM substrate.sync_headhunter_epoch_guard_job();
EXCEPTION WHEN OTHERS THEN
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('HEADHUNTER_EPOCH', 'ERROR', 'run_headhunter_epoch_guard failed: ' || SQLERRM);
END;
$function$;

COMMENT ON FUNCTION substrate.run_headhunter_epoch_guard() IS
'Event-gated pg_cron retry guard. It only wakes while an eligible scan retry exists, uses EPOCH_GUARD_SCHEDULE while awake, and turns itself off after success, retry-budget exhaustion, or the retry window.';

SELECT substrate.sync_headhunter_epoch_guard_job();

COMMIT;
