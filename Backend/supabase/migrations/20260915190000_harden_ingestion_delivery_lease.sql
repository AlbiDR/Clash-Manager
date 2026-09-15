-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Scheduled ingestion takes 52-141 seconds in production, while its pg_net
-- caller previously gave up at 30 seconds. Preserve the deployed function
-- bodies (which may differ in their secret lookup) and correct the delivery
-- budget, then ensure a stranded run cannot be overwritten by the next tick.

BEGIN;

DO $patch$
DECLARE
    v_signature regprocedure;
    v_definition text;
    v_patched text;
BEGIN
    FOREACH v_signature IN ARRAY ARRAY[
        'substrate.run_ingest_royale_data()'::regprocedure,
        'substrate.run_headhunter_scanner()'::regprocedure,
        'substrate.run_headhunter_epoch_guard()'::regprocedure
    ]
    LOOP
        v_definition := pg_get_functiondef(v_signature);
        IF v_definition !~ 'timeout_milliseconds\s*:=' THEN
            RAISE WARNING 'No explicit pg_net timeout found in %', v_signature;
            CONTINUE;
        END IF;

        v_patched := regexp_replace(
            v_definition,
            'timeout_milliseconds\s*:=\s*[0-9]+',
            'timeout_milliseconds := 180000',
            'g'
        );

        IF v_patched = v_definition THEN
            RAISE WARNING 'pg_net timeout was unchanged for %', v_signature;
        ELSE
            EXECUTE v_patched;
        END IF;
    END LOOP;
END
$patch$;

CREATE OR REPLACE FUNCTION substrate.dispatch_royale_ingestion()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_active boolean;
BEGIN
    SELECT status = 'RUNNING'
       AND last_triggered_at > now() - interval '15 minutes'
    INTO v_active
    FROM substrate.pipeline_heartbeat
    WHERE component_id = 'ROYALE_DATA_INGESTOR';

    IF COALESCE(v_active, false) THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES (
            'INGESTION_TRIGGER',
            'SUPPRESSED',
            'Scheduled ingestion was suppressed because the prior run still holds its 15-minute lease.'
        );
        RETURN 'SUPPRESSED';
    END IF;

    PERFORM substrate.run_ingest_royale_data();
    RETURN 'DISPATCHED';
END;
$function$;

REVOKE ALL ON FUNCTION substrate.dispatch_royale_ingestion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION substrate.dispatch_royale_ingestion() TO service_role;

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

    RETURN v_reset_count;
END;
$function$;

COMMIT;
