-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Captures the dispatching net.http_post() request_id against the component's
-- heartbeat row, and has pipeline_watchdog() look it up in net._http_response
-- (pg_net's own cleanup purges rows after some hours - observed retaining
-- roughly 6 hours' worth on 2026-09-27) before it is gone, recording it in
-- governance_telemetry so a lease-timeout has a cause attached.
-- Reasoning in the COMMENT ON blocks below.

BEGIN;

ALTER TABLE substrate.pipeline_heartbeat ADD COLUMN IF NOT EXISTS last_request_id bigint;

COMMENT ON COLUMN substrate.pipeline_heartbeat.last_request_id IS
'The bigint net.http_post() returned when this component''s current cycle was '
'dispatched (net._http_response.id, once a response exists). Written by the '
'dispatcher (e.g. substrate.run_ingest_royale_data()) right after firing the '
'HTTP call, before the edge function has necessarily reported RUNNING. Read by '
'substrate.pipeline_watchdog() when it marks a lease FAILED on timeout, to look '
'up what the call actually returned while the row still exists. '
'substrate.report_heartbeat()''s upsert does not list this column, so it survives '
'every RUNNING/COMPLETED/FAILED report in between.';

CREATE OR REPLACE FUNCTION substrate.run_ingest_royale_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_token      text;
    v_request_id bigint;
BEGIN
    v_token := substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');

    v_request_id := net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/ingest-royale-data',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer ' || v_token
        ),
        timeout_milliseconds := 180000
    );

    UPDATE substrate.pipeline_heartbeat
    SET last_request_id = v_request_id
    WHERE component_id = 'ROYALE_DATA_INGESTOR';
END;
$function$;

CREATE OR REPLACE FUNCTION substrate.pipeline_watchdog()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_reset_count integer := 0;
    v_lease       record;
    v_response    record;
    v_detail      text;
BEGIN
    -- Failing rows still carry their pre-timeout last_request_id here: the
    -- UPDATE below only overwrites status/timestamps/message, and RETURNING
    -- reads the row as this statement leaves it, request_id included.
    FOR v_lease IN
        UPDATE substrate.pipeline_heartbeat
        SET status          = 'FAILED',
            last_failure_at = now(),
            last_message    = 'Watchdog timeout: Pipeline exceeded its 15-minute execution lease.',
            updated_at      = now()
        WHERE status = 'RUNNING'
          AND last_triggered_at < now() - interval '15 minutes'
        RETURNING component_id, last_request_id
    LOOP
        v_detail := NULL;
        IF v_lease.last_request_id IS NOT NULL THEN
            SELECT status_code, timed_out, left(coalesce(error_msg, ''), 200) AS error_msg,
                   left(coalesce(content, ''), 200) AS content
              INTO v_response
              FROM net._http_response
             WHERE id = v_lease.last_request_id;

            IF FOUND THEN
                v_detail := 'status=' || coalesce(v_response.status_code::text, 'null')
                    || ' timed_out=' || v_response.timed_out::text
                    || CASE WHEN v_response.error_msg <> '' THEN ' error=' || v_response.error_msg ELSE '' END
                    || CASE WHEN v_response.content <> '' THEN ' content=' || v_response.content ELSE '' END;
            ELSE
                v_detail := 'no response recorded for request_id ' || v_lease.last_request_id
                    || ' (pg_net has not received one yet, or has already purged it)';
            END IF;
        ELSE
            v_detail := 'no request_id recorded for this lease (dispatcher predates this column, or never set it)';
        END IF;

        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('WATCHDOG_LEASE_FAILURE', 'WARNING',
                v_lease.component_id || ' lease timed out: ' || v_detail);

        -- Not GET DIAGNOSTICS after the loop: the INSERT two lines up would be
        -- the last statement executed, and its row count is always 1.
        v_reset_count := v_reset_count + 1;
    END LOOP;

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

COMMENT ON FUNCTION substrate.pipeline_watchdog() IS
'Ticks every 10 minutes (pipeline-watchdog cron job). Fails any pipeline_heartbeat '
'lease stuck RUNNING past 15 minutes, and since 2026-09-27 records what its dispatch '
'actually returned (net._http_response, via last_request_id) as a WATCHDOG_LEASE_FAILURE '
'governance_telemetry row - one per failed lease, alongside the pre-existing aggregate '
'WATCHDOG_INTERVENTION count. Also runs substrate.check_resource_pressure(), isolated so '
'that check cannot abort the lease-failure handling above it. '
'WHY: 7 lease timeouts on ROYALE_DATA_INGESTOR between 2026-09-23 and 2026-09-27 had no '
'recorded cause; by the time anyone looked, pg_net had purged the response (observed '
'retaining roughly 6 hours'' worth). One (2026-09-26 17:50) was caught live: WORKER_RESOURCE_LIMIT '
'(546). Do not remove last_request_id capture from a dispatcher without expecting this to '
'go blind for that component again.';

COMMIT;
