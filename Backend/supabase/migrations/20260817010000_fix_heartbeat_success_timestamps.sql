-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Restore last_success_at / last_failure_at maintenance for Edge Function components
-- =============================================================================
--
-- SYMPTOM
-- -------
-- substrate.pipeline_heartbeat.last_success_at was frozen at 2026-04-30 for the
-- two components that report through Edge Functions:
--
--   ROYALE_DATA_INGESTOR   last_success_at 2026-04-30T18:00:39Z
--   HEADHUNTER_SCANNER     last_success_at 2026-04-30T18:15:14Z
--
-- while the two components that write the table directly from SQL were current:
--
--   RECRUIT_ROTATION       last_success_at today
--   NIGHTLY_MAINTENANCE    last_success_at today
--
-- The pipeline itself was healthy the whole time. Only the timestamp was stuck.
--
-- ROOT CAUSE
-- ----------
-- There are two report_heartbeat implementations. `substrate.report_heartbeat`
-- maintains the success/failure stamps with a CASE on the reported status.
-- `public.report_heartbeat` -- the one Edge Functions actually reach, because the
-- Data API exposes `public` and not `substrate` -- is not a thin wrapper around it
-- but a separate reimplementation, and its ON CONFLICT clause updates only
-- status, last_message, last_triggered_at and metadata. The two timestamp columns
-- were simply absent from the update list, so they kept whatever value they held
-- when the wrapper took over.
--
-- The failure hid because protocol.ts also passes the real instant inside
-- p_metadata (see `last_success_at: Temporal.Now.instant().toString()`), and the
-- wrapper does merge metadata. So the truth was being recorded on every run, just
-- into the jsonb blob instead of the column every reader looks at. Nothing read
-- the column until features.pipeline_heartbeat_view exposed it to the PWA, which
-- is why a 3.5-month-old stamp went unnoticed.
--
-- PREVENTIVE ACTION
-- -----------------
-- The two missing columns are added to the wrapper's ON CONFLICT list, mirroring
-- the CASE logic in substrate.report_heartbeat exactly.
--
-- Deliberately NOT delegating to substrate.report_heartbeat, which would be the
-- obvious way to stop the two copies drifting again: that function also assigns
-- `discovery_yield = EXCLUDED.discovery_yield`, and this wrapper has no p_yield
-- parameter, so delegating would reset HEADHUNTER_SCANNER's discovery_yield to 0
-- on every report. Consolidating the two implementations needs that parameter
-- threaded through first, which is a wider change than this fix should carry.

CREATE OR REPLACE FUNCTION public.report_heartbeat(p_component_id text, p_status text, p_message text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (component_id, status, last_message, last_triggered_at, metadata)
    VALUES (p_component_id, p_status, p_message, NOW(), p_metadata)
    ON CONFLICT (component_id) DO UPDATE
    SET status = EXCLUDED.status,
        last_message = EXCLUDED.last_message,
        last_triggered_at = EXCLUDED.last_triggered_at,
        -- [FIX] These two clauses were missing, freezing both stamps for every
        -- component that reports through this wrapper. Mirrors the CASE in
        -- substrate.report_heartbeat: only advance on the matching terminal
        -- status, and otherwise preserve the existing value rather than nulling
        -- it, so a RUNNING report never erases the last known success.
        last_success_at = CASE
            WHEN EXCLUDED.status = 'COMPLETED' THEN NOW()
            ELSE substrate.pipeline_heartbeat.last_success_at
        END,
        last_failure_at = CASE
            WHEN EXCLUDED.status = 'FAILED' THEN NOW()
            ELSE substrate.pipeline_heartbeat.last_failure_at
        END,
        metadata = substrate.pipeline_heartbeat.metadata || EXCLUDED.metadata;
END;
$function$;

COMMENT ON FUNCTION public.report_heartbeat(text, text, text, jsonb) IS
  'Public-schema heartbeat reporter reached by the Edge Functions, which cannot
   see the substrate schema over the Data API. Maintains last_success_at and
   last_failure_at in addition to status/message/metadata; omitting those two
   columns previously froze both stamps at 2026-04-30 for ROYALE_DATA_INGESTOR
   and HEADHUNTER_SCANNER while the pipeline itself ran normally.';

-- -----------------------------------------------------------------------------
-- One-time reconciliation of the rows the bug froze
-- -----------------------------------------------------------------------------
-- Without this the two affected components keep reporting a 2026-04-30 stamp to
-- the PWA until their next COMPLETED run. The value is recovered from the same
-- row's metadata, which the wrapper has been merging correctly all along, so this
-- promotes data that already exists rather than inventing a timestamp.
--
-- Guards: only rows whose metadata stamp is well-formed and strictly newer than
-- the column are touched, so the statement is idempotent and cannot move any
-- stamp backwards.
UPDATE substrate.pipeline_heartbeat ph
   SET last_success_at = (ph.metadata->>'last_success_at')::timestamptz
 WHERE ph.metadata->>'last_success_at' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
   AND (
        ph.last_success_at IS NULL
     OR (ph.metadata->>'last_success_at')::timestamptz > ph.last_success_at
   );
