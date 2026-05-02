-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Fix sync_recruits last_scan
 * 
 * Root Cause Analysis:
 * The sync_recruits RPC (created in 20260501170000_ingestion_rpc_bridge.sql) 
 * failed to include `last_scan` in its INSERT and UPDATE statements. 
 * As a result, when the `rescan.ts` stage processed stale recruits, their 
 * `last_scan` timestamp was never updated in the database.
 * 
 * Because get_stale_recruits sorts by `last_scan ASC`, the same subset of 
 * recruits (the top N by raw_potential_score) were repeatedly returned 
 * on every execution, while recruits lower down the list (e.g., 51-101) 
 * were permanently starved and never rescanned. This allowed them to join 
 * clans without the system detecting the change.
 */

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO drivers.recruits (player_tag, player_name, trophies, source, status, last_scan)
    SELECT 
        (val->>'player_tag')::TEXT, 
        (val->>'player_name')::TEXT, 
        (val->>'trophies')::INTEGER, 
        (val->>'source')::TEXT, 
        (val->>'status')::TEXT,
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET player_name = EXCLUDED.player_name,
        trophies = EXCLUDED.trophies,
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        last_scan = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
