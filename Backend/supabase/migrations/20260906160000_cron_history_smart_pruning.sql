-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Fold cron.job_run_details into substrate.cron_run_daily daily aggregates,
-- then delete only folded days. Rationale in the commit message.

BEGIN;

CREATE OR REPLACE FUNCTION substrate.config_int(p_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_raw text;
BEGIN
    SELECT value INTO v_raw FROM substrate.config WHERE key = p_key;
    IF v_raw IS NULL OR v_raw !~ '^\s*-?\d+\s*$' THEN
        RETURN NULL;
    END IF;
    RETURN trim(v_raw)::integer;
END;
$function$;

INSERT INTO substrate.config (key, value, description) VALUES
    ('CRON_HISTORY_KEEP_DAYS',   '7',
     'Days of raw cron.job_run_details retained after a day has been folded.'),
    ('CRON_ROLLUP_KEEP_DAYS',    '730',
     'Days of folded daily cron history retained in substrate.cron_run_daily.'),
    ('CRON_PURGE_BATCH_ROWS',    '20000',
     'Maximum raw cron rows deleted per purge invocation.'),
    ('CRON_FOLD_MAX_DAYS',       '30',
     'Maximum distinct days folded per invocation, so the first backfill cannot open one huge transaction.'),
    ('CRON_FOLD_REVISE_DAYS',    '2',
     'Recently folded days re-aggregated each run, to absorb late-arriving rows.'),
    ('CRON_ABANDON_AFTER_HOURS', '6',
     'A run with no end_time older than this is treated as abandoned, so a crashed job cannot block folding forever.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS substrate.cron_run_daily (
    jobid        bigint      NOT NULL,
    jobname      text        NOT NULL,
    run_date     date        NOT NULL,
    runs         integer     NOT NULL,
    successes    integer     NOT NULL,
    failures     integer     NOT NULL,
    unfinished   integer     NOT NULL,
    completed    integer     NOT NULL,   -- runs with a measurable duration
    overlapping_runs integer NOT NULL,   -- began while a previous run was live
    duration_min interval,
    duration_avg interval,
    duration_max interval,
    last_error   text,
    folded_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cron_run_daily_pkey PRIMARY KEY (jobid, run_date)
);

ALTER TABLE substrate.cron_run_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cron_run_daily_date
    ON substrate.cron_run_daily (run_date DESC);

CREATE OR REPLACE FUNCTION substrate.fold_cron_history()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_days     integer := 0;
    v_abandon  integer;
    v_revise   integer;
    v_max_days integer;
BEGIN
    -- Single-flight, transaction-scoped so it cannot leak on an exception.
    -- Two-key form with a project namespace, so the key cannot collide with an
    -- unrelated advisory lock elsewhere in the schema.
    IF NOT pg_try_advisory_xact_lock(1734, 1) THEN
        RETURN 0;
    END IF;

    -- Clamped: config is user-editable and a negative or zero value here would
    -- silently disable folding rather than fail loudly.
    v_abandon  := GREATEST(COALESCE(substrate.config_int('CRON_ABANDON_AFTER_HOURS'), 6), 1);
    v_revise   := GREATEST(COALESCE(substrate.config_int('CRON_FOLD_REVISE_DAYS'), 2), 0);
    v_max_days := GREATEST(COALESCE(substrate.config_int('CRON_FOLD_MAX_DAYS'), 30), 1);

    WITH target_days AS (
        -- Bounded work per invocation. The first backfill spans five months;
        -- without this the fold would aggregate every row in one transaction,
        -- which is exactly the kind of statement that hurt this instance.
        SELECT x.run_date
        FROM (
            SELECT DISTINCT (d.start_time AT TIME ZONE 'UTC')::date AS run_date
            FROM cron.job_run_details d
            WHERE (d.start_time AT TIME ZONE 'UTC')::date
                  < (now() AT TIME ZONE 'UTC')::date
        ) x
        WHERE (
                NOT EXISTS (
                    SELECT 1 FROM substrate.cron_run_daily p
                    WHERE p.run_date = x.run_date
                )
                OR x.run_date >= (now() AT TIME ZONE 'UTC')::date - v_revise
              )
          -- Never fold a day that still has a live run in it: folding then
          -- deleting would freeze a partial aggregate that can never be
          -- corrected. A run abandoned without an end_time stops blocking
          -- once it ages past CRON_ABANDON_AFTER_HOURS.
          AND NOT EXISTS (
                SELECT 1 FROM cron.job_run_details u
                WHERE (u.start_time AT TIME ZONE 'UTC')::date = x.run_date
                  AND u.end_time IS NULL
                  AND u.start_time > now() - make_interval(hours => v_abandon)
              )
        ORDER BY x.run_date
        LIMIT v_max_days
    )
    INSERT INTO substrate.cron_run_daily AS t (
        jobid, jobname, run_date, runs, successes, failures, unfinished,
        completed, overlapping_runs, duration_min, duration_avg, duration_max,
        last_error, folded_at
    )
    SELECT
        r.jobid,
        COALESCE(max(j.jobname), 'jobid:' || r.jobid),
        r.run_date,
        count(*),
        count(*) FILTER (WHERE r.status = 'succeeded'),
        count(*) FILTER (WHERE r.status = 'failed'),
        count(*) FILTER (WHERE r.status NOT IN ('succeeded', 'failed')),
        count(*) FILTER (WHERE r.dur IS NOT NULL),
        count(*) FILTER (WHERE r.prev_end > r.start_time),
        min(r.dur),
        avg(r.dur),
        max(r.dur),
        (array_agg(r.return_message ORDER BY r.start_time DESC)
            FILTER (WHERE r.status = 'failed'))[1],
        now()
    FROM (
        SELECT
            d.jobid, d.status, d.return_message, d.start_time,
            (d.start_time AT TIME ZONE 'UTC')::date AS run_date,
            d.end_time - d.start_time               AS dur,
            -- Latest end_time among this job's earlier runs that same day. If
            -- it is still in the future relative to this run's start, the two
            -- overlapped. Overlap is the direct measure of the pile-up that
            -- caused the 2026-09-06 incident, and nothing else records it.
            max(d.end_time) OVER (
                PARTITION BY d.jobid, (d.start_time AT TIME ZONE 'UTC')::date
                ORDER BY d.start_time
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS prev_end
        FROM cron.job_run_details d
        JOIN target_days td
          ON td.run_date = (d.start_time AT TIME ZONE 'UTC')::date
    ) r
    LEFT JOIN cron.job j ON j.jobid = r.jobid
    GROUP BY r.jobid, r.run_date
    ON CONFLICT (jobid, run_date) DO UPDATE SET
        jobname      = EXCLUDED.jobname,
        runs         = EXCLUDED.runs,
        successes    = EXCLUDED.successes,
        failures     = EXCLUDED.failures,
        unfinished   = EXCLUDED.unfinished,
        completed    = EXCLUDED.completed,
        overlapping_runs = EXCLUDED.overlapping_runs,
        duration_min = EXCLUDED.duration_min,
        duration_avg = EXCLUDED.duration_avg,
        duration_max = EXCLUDED.duration_max,
        last_error   = EXCLUDED.last_error,
        folded_at    = now();

    GET DIAGNOSTICS v_days = ROW_COUNT;
    RETURN v_days;  -- xact lock releases on commit; no explicit unlock
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.purge_cron_history()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_keep_days integer;
    v_batch     integer;
    v_rollup    integer;
    v_deleted   integer := 0;
    v_rolled    integer := 0;
BEGIN
    v_keep_days := COALESCE(substrate.config_int('CRON_HISTORY_KEEP_DAYS'), 7);
    v_batch     := COALESCE(substrate.config_int('CRON_PURGE_BATCH_ROWS'), 20000);
    v_rollup    := COALESCE(substrate.config_int('CRON_ROLLUP_KEEP_DAYS'), 730);

    DELETE FROM cron.job_run_details
    WHERE runid IN (
        SELECT r.runid
        FROM cron.job_run_details r
        -- Compared against the raw timestamptz rather than a per-row
        -- (start_time AT TIME ZONE 'UTC')::date expression. The expression form
        -- cannot use an index and had to be evaluated for all 186k rows on
        -- every pass. This boundary is exactly equivalent: every row whose UTC
        -- day is earlier than the cutoff date, so it stays aligned with the
        -- day grouping the fold uses.
        WHERE r.start_time
              < (((now() AT TIME ZONE 'UTC')::date - v_keep_days)::timestamp
                 AT TIME ZONE 'UTC')
          AND EXISTS (
                SELECT 1
                FROM substrate.cron_run_daily f
                WHERE f.jobid    = r.jobid
                  AND f.run_date = (r.start_time AT TIME ZONE 'UTC')::date
              )
        LIMIT v_batch
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Bound the rollup too, or this only makes the same problem slower.
    DELETE FROM substrate.cron_run_daily
    WHERE run_date < (now() AT TIME ZONE 'UTC')::date - v_rollup;
    GET DIAGNOSTICS v_rolled = ROW_COUNT;

    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('SYSTEM_PURGE', 'SUCCESS',
            'Cron history: ' || v_deleted || ' raw rows evicted beyond '
            || v_keep_days || ' days; ' || v_rolled || ' rollup rows beyond '
            || v_rollup || ' days.');

    RETURN v_deleted;
END;
$function$;

CREATE OR REPLACE VIEW substrate.cron_health AS
SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    f.last_folded_date,
    ((now() AT TIME ZONE 'UTC')::date - f.last_folded_date) AS fold_lag_days,
    CASE
        WHEN f.last_folded_date IS NULL                                        THEN 'NEVER_FOLDED'
        WHEN (now() AT TIME ZONE 'UTC')::date - f.last_folded_date > 2         THEN 'STALE'
        ELSE 'OK'
    END AS fold_status
FROM cron.job j
LEFT JOIN LATERAL (
    SELECT max(run_date) AS last_folded_date
    FROM substrate.cron_run_daily d
    WHERE d.jobid = j.jobid
) f ON true;

CREATE OR REPLACE VIEW substrate.cron_health_trend AS
WITH jobs AS (
    -- Both windows: driving off `recent` alone hid jobs that stopped entirely.
    SELECT jobid, max(jobname) AS jobname
    FROM substrate.cron_run_daily
    WHERE run_date >= (now() AT TIME ZONE 'UTC')::date - 35
    GROUP BY jobid
),
recent AS (
    SELECT jobid,
           -- Weighted by `completed`; `runs` would overstate unfinished days.
           sum(duration_avg * completed::double precision) FILTER (WHERE duration_avg IS NOT NULL)
             / NULLIF(sum(completed) FILTER (WHERE duration_avg IS NOT NULL), 0)::double precision
             AS avg_recent,
           sum(runs)::numeric     / NULLIF(count(*), 0)  AS runs_per_day_recent,
           sum(failures)::numeric / NULLIF(sum(runs), 0) AS failure_rate_recent,
           sum(overlapping_runs)                         AS overlapping_recent
    FROM substrate.cron_run_daily
    WHERE run_date >= (now() AT TIME ZONE 'UTC')::date - 7
    GROUP BY jobid
),
baseline AS (
    SELECT jobid,
           sum(duration_avg * completed::double precision) FILTER (WHERE duration_avg IS NOT NULL)
             / NULLIF(sum(completed) FILTER (WHERE duration_avg IS NOT NULL), 0)::double precision
             AS avg_baseline,
           sum(runs)::numeric     / NULLIF(count(*), 0)  AS runs_per_day_baseline,
           sum(failures)::numeric / NULLIF(sum(runs), 0) AS failure_rate_baseline
    FROM substrate.cron_run_daily
    WHERE run_date >= (now() AT TIME ZONE 'UTC')::date - 35
      AND run_date <  (now() AT TIME ZONE 'UTC')::date - 7
    GROUP BY jobid
),
ratio AS (
    SELECT
        jb.jobid, jb.jobname, r.avg_recent, b.avg_baseline,
        COALESCE(r.overlapping_recent, 0)                     AS overlapping_recent,
        round(COALESCE(r.runs_per_day_recent, 0), 1)          AS runs_per_day_recent,
        round(b.runs_per_day_baseline, 1)                     AS runs_per_day_baseline,
        round(COALESCE(r.failure_rate_recent, 0), 3)          AS failure_rate_recent,
        round(b.failure_rate_baseline, 3)                     AS failure_rate_baseline,
        round((extract(epoch FROM r.avg_recent)
               / NULLIF(extract(epoch FROM b.avg_baseline), 0))::numeric, 2) AS duration_ratio,
        round((COALESCE(r.runs_per_day_recent, 0)
               / NULLIF(b.runs_per_day_baseline, 0))::numeric, 2)            AS throughput_ratio
    FROM jobs jb
    LEFT JOIN recent   r USING (jobid)
    LEFT JOIN baseline b USING (jobid)
)
SELECT *,
    -- Most-diagnostic first; a job that never starts has no duration to judge.
    CASE
        WHEN runs_per_day_recent = 0
             AND COALESCE(runs_per_day_baseline, 0) > 0 THEN 'SILENT'
        WHEN overlapping_recent > 0                     THEN 'OVERLAPPING'
        WHEN throughput_ratio < 0.8                     THEN 'STARVED'
        WHEN duration_ratio  > 2                        THEN 'SLOWING'
        WHEN failure_rate_recent
             > failure_rate_baseline + 0.05             THEN 'FAILING'
        WHEN avg_baseline IS NULL                       THEN 'NO_BASELINE'
        ELSE 'OK'
    END AS verdict
FROM ratio;

CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_start_time TIMESTAMPTZ := NOW();
BEGIN
    PERFORM substrate.pipeline_watchdog();

    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_triggered_at, last_message)
    VALUES ('NIGHTLY_MAINTENANCE', 'RUNNING', v_start_time, 'Consolidated maintenance cycle initiated.')
    ON CONFLICT (component_id) DO UPDATE
    SET status            = 'RUNNING',
        last_triggered_at = EXCLUDED.last_triggered_at,
        last_message      = EXCLUDED.last_message;

    -- L0 Substrate Purges
    PERFORM substrate.purge_raw_logs(24);
    PERFORM substrate.purge_governance_telemetry();
    PERFORM substrate.purge_clanned_recruits();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
    PERFORM substrate.finalize_expired_voyages();

    -- Consolidate voyage history before player purges fire so that
    -- contribution data is safely archived before cascade deletes run.
    PERFORM drivers.consolidate_voyage_history();

    -- L2 Domain Purges
    PERFORM drivers.purge_expired_blacklist();
    PERFORM substrate.purge_inactive_members();
    PERFORM substrate.purge_stale_battles();
    PERFORM substrate.purge_worst_recruits();
    PERFORM substrate.purge_orphan_players();

    -- Safety-net: log any history rows that survived beyond the cascade.
    PERFORM drivers.purge_stale_voyage_history();

    PERFORM substrate.purge_recruit_ledger();
    PERFORM substrate.purge_stale_recruits();

    PERFORM substrate.rotate_recruits();

    -- L3 Control-plane hygiene. Fold before prune, same ordering discipline as
    -- consolidate_voyage_history() above. Isolated so it cannot abort the rest.
    BEGIN
        PERFORM substrate.fold_cron_history();
        PERFORM substrate.purge_cron_history();
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('SYSTEM_PURGE', 'ERROR', 'Cron history maintenance failed: ' || SQLERRM);
    END;

    UPDATE substrate.pipeline_heartbeat
    SET status          = 'COMPLETED',
        last_success_at = NOW(),
        last_message    = 'Maintenance complete. Raw logs, ledgers, stale battles, orphans, voyage and cron history pruned. Voyages finalized.',
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
END;
$function$;

COMMIT;
