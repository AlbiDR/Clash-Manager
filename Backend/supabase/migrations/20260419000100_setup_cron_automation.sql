-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 0. Create a secure accessor for the Vault
-- This is security definer to allow the 'postgres' role (used by cron) to access vault.decrypted_secrets
CREATE OR REPLACE FUNCTION substrate.get_vault_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_secret text;
BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = p_name;
    
    RETURN v_secret;
END;
$$;

-- 1. Create a wrapper function for nightly maintenance
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'substrate', 'drivers', 'public'
AS $$
BEGIN
    -- Execute all nightly cleanups
    PERFORM substrate.purge_clanned_recruits();
    PERFORM substrate.purge_expired_blacklist();
    PERFORM substrate.purge_stale_discovery_cache();
    PERFORM substrate.purge_stale_heritage();
END;
$$;

-- 2. Setup Cron Jobs
-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Clear existing jobs if any to avoid duplicates
DO $$
BEGIN
    PERFORM cron.unschedule('ingest-royale-data-cron');
    PERFORM cron.unschedule('headhunter-scanner-cron');
    PERFORM cron.unschedule('nightly-maintenance-cron');
EXCEPTION WHEN OTHERS THEN
    -- Ignore if they don't exist
END
$$;

-- Schedule Ingest Royale Data (Every 30 minutes, at 0 and 30)
SELECT cron.schedule(
    'ingest-royale-data-cron',
    '0,30 * * * *',
    $$ SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/ingest-royale-data',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || substrate.get_vault_secret('INTERNAL_BEARER_TOKEN'))
    ); $$
);

-- Schedule Headhunter Scanner (Every 30 minutes, staggered to 15 and 45)
SELECT cron.schedule(
    'headhunter-scanner-cron',
    '15,45 * * * *',
    $$ SELECT net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || substrate.get_vault_secret('INTERNAL_BEARER_TOKEN'))
    ); $$
);

-- Schedule Nightly Maintenance (Every day at 03:00 UTC)
SELECT cron.schedule(
    'nightly-maintenance-cron',
    '0 3 * * *',
    $$ SELECT substrate.execute_nightly_maintenance(); $$
);
