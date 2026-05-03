-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
VAULT-BASED AUTHENTICATION MIGRATION
----------------------------------------------------------------------------
This migration shifts the internal Cron-to-Function authentication from 
hardcoded "injected" secrets to the authoritative Supabase Vault.

1. Defines a secure accessor for vault secrets.
2. Implements wrapper RPCs for pipeline execution.
3. Decouples cron jobs from secret injection.
============================================================================
*/

-- 1. Create a secure accessor for the Vault
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

-- 2. Define Wrapper RPCs for HTTP Triggering
-- This removes the need for headers to exist in the pg_cron table.

CREATE OR REPLACE FUNCTION substrate.run_ingest_royale_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token text;
BEGIN
    v_token := substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');
    
    PERFORM net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/ingest-royale-data',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer ' || v_token
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION substrate.run_headhunter_scanner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token text;
BEGIN
    v_token := substrate.get_vault_secret('INTERNAL_BEARER_TOKEN');
    
    PERFORM net.http_post(
        url := 'https://hucktamloykszinwbtuh.supabase.co/functions/v1/headhunter-scanner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y2t0YW1sb3lrc3ppbndidHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDQ4MDMsImV4cCI6MjA4OTg4MDgwM30.hLybwvsfXsVre7pVtGL6-gIXZrp_EW7vVHFe-6HkLYE',
            'Authorization', 'Bearer ' || v_token
        ),
        body := '{"tournaments": ["AUTO"]}'::jsonb
    );
END;
$$;

-- 3. Reschedule Cron Jobs to use Wrappers
-- This makes the cron system "Zero-Drift" relative to secret rotations.

SELECT cron.unschedule('ingest-royale-data-cron');
SELECT cron.unschedule('headhunter-scanner-cron');

SELECT cron.schedule(
    'ingest-royale-data-cron',
    '0,30 * * * *',
    'SELECT substrate.run_ingest_royale_data();'
);

SELECT cron.schedule(
    'headhunter-scanner-cron',
    '15,45 * * * *',
    'SELECT substrate.run_headhunter_scanner();'
);
