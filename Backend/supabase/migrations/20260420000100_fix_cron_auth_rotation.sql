-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
CRON AUTHENTICATION RE-SYNC
----------------------------------------------------------------------------
This migration ensures that all scheduled cron jobs are using the newly
rotated INTERNAL_BEARER_TOKEN. 

This is necessary because previous migrations that defined these jobs
may have already been applied with old or hardcoded secrets.
============================================================================
*/

-- 1. UNSCHEDULE EXISTING JOBS TO PREVENT DRIFT
SELECT cron.unschedule('ingest-royale-data-cron');
SELECT cron.unschedule('headhunter-scanner-cron');

-- 2. RE-SCHEDULE WITH INJECTED SECRET
-- Schedule Ingest Royale Data (Every 30 minutes, at 0 and 30)
SELECT cron.schedule(
    'ingest-royale-data-cron',
    '0,30 * * * *',
    $$ SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/ingest-royale-data',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || substrate.get_vault_secret('INTERNAL_BEARER_TOKEN')
        )
    ); $$
);

-- Schedule Headhunter Scanner (Every 30 minutes, staggered to 15 and 45)
SELECT cron.schedule(
    'headhunter-scanner-cron',
    '15,45 * * * *',
    $$ SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || substrate.get_vault_secret('INTERNAL_BEARER_TOKEN')
        ),
        body := '{"tournaments": ["AUTO"]}'::jsonb
    ); $$
);
