-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Event-gates finalize-expired-voyages the way 20260907010000 gates
-- voyage-auto-activate-cron: dormant unless a voyage is ACTIVE with an end_at
-- to wait for. It had run ~288x/day for nothing since 20260923225809.
-- Reasoning lives in the COMMENT ON blocks below (queryable via psql \df+).

BEGIN;

INSERT INTO substrate.config (key, value, description) VALUES
    ('VOYAGE_FINALIZATION_SCHEDULE', '*/5 * * * *',
     'Cadence for finalize-expired-voyages WHILE a voyage is ACTIVE with an end_at. The job is dormant otherwise. This bounds how late a voyage can flip to COMPLETED after end_at, which VoyageBanner.vue shows live.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION drivers.sync_voyage_finalization_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_jobid    bigint;
    v_awaiting boolean;
    v_schedule text;
BEGIN
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'finalize-expired-voyages';
    IF v_jobid IS NULL THEN
        RETURN;  -- job not provisioned in this environment; nothing to steer
    END IF;

    -- Only an ACTIVE voyage with an end_at can ever become expired. An ACTIVE
    -- voyage still awaiting its end time has nothing for the job to find.
    SELECT EXISTS (
        SELECT 1
          FROM drivers.clan_voyage
         WHERE status = 'ACTIVE'
           AND end_at IS NOT NULL
    ) INTO v_awaiting;

    IF v_awaiting THEN
        SELECT value INTO v_schedule FROM substrate.config WHERE key = 'VOYAGE_FINALIZATION_SCHEDULE';
        PERFORM cron.alter_job(v_jobid, schedule := COALESCE(v_schedule, '*/5 * * * *'), active := true);
    ELSE
        PERFORM cron.alter_job(v_jobid, active := false);
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION drivers.on_voyage_active_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    PERFORM drivers.sync_voyage_finalization_job();
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_voyage_finalization_gate ON drivers.clan_voyage;
CREATE TRIGGER trg_voyage_finalization_gate
AFTER INSERT OR DELETE OR UPDATE OF status, end_at ON drivers.clan_voyage
FOR EACH STATEMENT EXECUTE FUNCTION drivers.on_voyage_active_change();

COMMENT ON FUNCTION drivers.sync_voyage_finalization_job() IS
'Turns the finalize-expired-voyages pg_cron job on only while some voyage is '
'ACTIVE with an end_at, and off otherwise. Called by trg_voyage_finalization_gate '
'on every statement that changes drivers.clan_voyage status or end_at. '
'Mirrors drivers.sync_voyage_activation_job() (20260907010000_voyage_activation_gate.sql). '
'WHY: 20260923225809 gave voyage expiry its own */5 schedule but left it running '
'permanently; with no voyage active since 2026-06-29 it ran ~288x/day at ~196ms '
'per run (pg_cron per-run floor on this project is ~110-130ms) and never found '
'anything to do, and the declared cron budget had to be raised 600 -> 900 to fit it. '
'Gated, it costs nothing at rest and the budget returns to 600. Latency while a '
'voyage is live is unchanged: the job runs every 5 minutes from the moment a '
'voyage becomes ACTIVE with an end_at until it is COMPLETED.';

COMMENT ON FUNCTION drivers.on_voyage_active_change() IS
'Statement-level trigger function for trg_voyage_finalization_gate (AFTER INSERT, '
'DELETE or UPDATE OF status, end_at on drivers.clan_voyage). Only delegates to '
'drivers.sync_voyage_finalization_job(); see that comment.';

COMMENT ON FUNCTION substrate.finalize_expired_voyages() IS
'Transitions any ACTIVE clan_voyage whose end_at has passed to COMPLETED, '
'pre-populating 0-crown contribution rows for members who did not participate '
'and pruning stale 0-crown rows for ex-members. '
'Callers: the ''finalize-expired-voyages'' pg_cron job, which is EVENT-GATED by '
'drivers.sync_voyage_finalization_job() (on only while a voyage is ACTIVE with an '
'end_at; query cron.job for the live state, not this comment), plus '
'substrate.execute_nightly_maintenance() once a day as a backstop. '
'History: until 20260923225809 it ran as a side effect of drivers.on_battle_recorded() '
'on every battle row outside an active voyage (~6,500x/day); that migration moved it '
'to a permanent */5 cron, and 20260926233013 gated that cron on real voyage state. '
'Not free per run: ~196ms end to end with nothing to finalize (measured 2026-09-26), '
'because the contributions cleanup DELETE runs unconditionally. '
'Why latency matters: Frontend-PWA/src/shared/ui/VoyageBanner.vue counts down to '
'end_at and refreshes exactly once at zero (Frontend-PWA/src/shared/composables/useCountdown.ts), '
'so while a voyage is live this must keep running on a cadence of minutes, not hours.';

SELECT drivers.sync_voyage_finalization_job();

COMMIT;
