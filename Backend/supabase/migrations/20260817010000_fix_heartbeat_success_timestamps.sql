-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


CREATE OR REPLACE FUNCTION public.report_heartbeat(p_component_id text, p_status text, p_message text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO substrate.pipeline_heartbeat (
        component_id,
        status,
        last_message,
        last_triggered_at,
        last_validation_report,
        is_data_perfect,
        last_success_at,
        last_failure_at,
        updated_at
    )
    VALUES (
        p_component_id,
        p_status::substrate.pipeline_status,
        p_message,
        NOW(),
        COALESCE(p_metadata->'last_validation_report', '{}'::jsonb),
        COALESCE((p_metadata->>'is_data_perfect')::BOOLEAN, FALSE),
        CASE WHEN p_status = 'COMPLETED' THEN NOW() ELSE NULL END,
        CASE WHEN p_status = 'FAILED'    THEN NOW() ELSE NULL END,
        NOW()
    )
    ON CONFLICT (component_id) DO UPDATE
    SET status            = EXCLUDED.status,
        last_message      = EXCLUDED.last_message,
        last_triggered_at = EXCLUDED.last_triggered_at,
        updated_at        = NOW(),

        -- Only advance a terminal stamp on its own terminal status, and otherwise
        -- keep the existing value. A RUNNING report must never erase the last
        -- known success or failure.
        last_success_at = CASE
            WHEN EXCLUDED.status = 'COMPLETED' THEN NOW()
            ELSE substrate.pipeline_heartbeat.last_success_at
        END,
        last_failure_at = CASE
            WHEN EXCLUDED.status = 'FAILED' THEN NOW()
            ELSE substrate.pipeline_heartbeat.last_failure_at
        END,

        -- Preserve the previous diagnosis when the caller sends no new one. The
        -- opening RUNNING report carries no metadata, so overwriting
        -- unconditionally (as substrate.report_heartbeat does) would discard the
        -- last completed run's validation report the moment the next run starts.
        last_validation_report = CASE
            WHEN p_metadata ? 'last_validation_report' THEN EXCLUDED.last_validation_report
            ELSE substrate.pipeline_heartbeat.last_validation_report
        END,
        is_data_perfect = CASE
            WHEN p_metadata ? 'is_data_perfect' THEN EXCLUDED.is_data_perfect
            ELSE substrate.pipeline_heartbeat.is_data_perfect
        END;
END;
$function$;

COMMENT ON FUNCTION public.report_heartbeat(text, text, text, jsonb) IS
  'Public-schema heartbeat reporter reached by the Edge Functions, which cannot see
   the substrate schema over the Data API. Until 14.45.18 this function inserted
   into a non-existent `metadata` column and therefore raised 42703 on every call,
   silently freezing ROYALE_DATA_INGESTOR and HEADHUNTER_SCANNER reporting at
   2026-04-30 while the pipeline itself ran normally. Maintains last_success_at and
   last_failure_at on terminal statuses and preserves the prior validation report
   when a caller sends none.';
