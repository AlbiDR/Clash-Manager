-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
--
-- Make voyage activation event-driven instead of a standing poll.
--
-- [Root Cause] voyage-auto-activate-cron existed to notice when a Clan Voyage's
-- start_at passes. It polled unconditionally, so with four voyages in the table
-- and the most recent one finished on 2026-06-29, it had answered "nothing to
-- do" on every run for over two months. Even after 2026-09-06 reduced it from
-- every minute to every fifteen, that is still ~35,000 executions a year to
-- wait for an event that happens a handful of times.
--
-- [Preventive Action] The job is now dormant by default and only runs while a
-- voyage is actually PENDING. A statement-level trigger on drivers.clan_voyage
-- wakes it the moment one is created, and auto_activate_pending_voyages()
-- stands it back down once nothing is pending. Steady-state cost is zero.
--
-- Polling during the pending window is deliberate rather than firing once at
-- the exact start minute. A single precisely-timed execution is more elegant,
-- but if the database is unavailable at that one minute the voyage never
-- activates at all, and on 2026-09-06 it was unavailable for three hours.
-- Polling self-heals; a one-shot does not.

BEGIN;

INSERT INTO substrate.config (key, value, description) VALUES
    ('VOYAGE_ACTIVATION_SCHEDULE', '*/5 * * * *',
     'Cadence for voyage-auto-activate-cron WHILE a voyage is pending. The job is dormant otherwise, so this only costs anything during the window between a voyage being created and it starting.')
ON CONFLICT (key) DO NOTHING;

-- Steers the cron job from the data, so the schedule follows real state rather
-- than a standing assumption. Looks the job up by name: the id is assigned by
-- pg_cron and must not be hardcoded.
CREATE OR REPLACE FUNCTION drivers.sync_voyage_activation_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_jobid    bigint;
    v_pending  integer;
    v_schedule text;
BEGIN
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'voyage-auto-activate-cron';
    IF v_jobid IS NULL THEN
        RETURN;  -- job not provisioned in this environment; nothing to steer
    END IF;

    SELECT count(*) INTO v_pending
      FROM drivers.clan_voyage
     WHERE status = 'PENDING';

    IF v_pending > 0 THEN
        SELECT value INTO v_schedule FROM substrate.config WHERE key = 'VOYAGE_ACTIVATION_SCHEDULE';
        PERFORM cron.alter_job(v_jobid, schedule := COALESCE(v_schedule, '*/5 * * * *'), active := true);
    ELSE
        PERFORM cron.alter_job(v_jobid, active := false);
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION drivers.on_voyage_pending_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    PERFORM drivers.sync_voyage_activation_job();
    RETURN NULL;
END;
$function$;

-- Statement-level: only the aggregate "is anything pending" matters, so this
-- fires once per statement rather than once per row.
DROP TRIGGER IF EXISTS trg_voyage_activation_gate ON drivers.clan_voyage;
CREATE TRIGGER trg_voyage_activation_gate
AFTER INSERT OR DELETE OR UPDATE OF status, start_at ON drivers.clan_voyage
FOR EACH STATEMENT EXECUTE FUNCTION drivers.on_voyage_pending_change();

-- Stand the job down after activating, so it stops as soon as its work is done.
CREATE OR REPLACE FUNCTION drivers.auto_activate_pending_voyages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE drivers.clan_voyage
    SET
        status     = 'ACTIVE',
        updated_at = now()
    WHERE status   = 'PENDING'
      AND start_at <= now();

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    -- Refresh contribution window only when at least one row was promoted.
    IF v_affected > 0 THEN
        PERFORM drivers.refresh_voyage_contributions();
    END IF;

    -- Re-evaluate whether this job still has anything to wait for. The UPDATE
    -- above already fires trg_voyage_activation_gate when it promotes a row;
    -- this call covers the case where it promoted nothing and the job should
    -- never have been awake.
    PERFORM drivers.sync_voyage_activation_job();
END;
$function$;

-- Apply the gate to current reality: nothing is PENDING, so stand it down now.
SELECT drivers.sync_voyage_activation_job();

COMMIT;
