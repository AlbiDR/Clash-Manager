-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Voyage activation is now event-gated: dormant unless a voyage is PENDING.
-- A statement-level trigger on drivers.clan_voyage wakes the cron job and
-- auto_activate_pending_voyages() stands it down. Rationale in the commit.

BEGIN;

INSERT INTO substrate.config (key, value, description) VALUES
    ('VOYAGE_ACTIVATION_SCHEDULE', '*/5 * * * *',
     'Cadence for voyage-auto-activate-cron WHILE a voyage is pending. The job is dormant otherwise, so this only costs anything during the window between a voyage being created and it starting.')
ON CONFLICT (key) DO NOTHING;

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

DROP TRIGGER IF EXISTS trg_voyage_activation_gate ON drivers.clan_voyage;
CREATE TRIGGER trg_voyage_activation_gate
AFTER INSERT OR DELETE OR UPDATE OF status, start_at ON drivers.clan_voyage
FOR EACH STATEMENT EXECUTE FUNCTION drivers.on_voyage_pending_change();

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

SELECT drivers.sync_voyage_activation_job();

COMMIT;
