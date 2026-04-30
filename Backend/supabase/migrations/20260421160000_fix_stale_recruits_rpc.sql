-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Fix Stale Recruits RPC
 * 
 * Corrects the get_stale_recruits function:
 * 1. Moves from drivers schema to public schema for accessibility.
 * 2. Corrects return column name from 'tag' to 'player_tag' to match TS code and ADR.
 * 3. Fixes internal column reference from 'r.tag' to 'r.player_tag'.
 * 4. Hardens search_path for security.
 */

-- 1. DROP THE LEGACY/BROKEN FUNCTION
DROP FUNCTION IF EXISTS drivers.get_stale_recruits(integer);

-- 2. CREATE THE AUTHORITATIVE PUBLIC RPC
CREATE OR REPLACE FUNCTION public.get_stale_recruits(p_limit integer DEFAULT 20)
RETURNS TABLE(player_tag text) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, drivers, substrate
AS $$
BEGIN
    RETURN QUERY
    SELECT r.player_tag
    FROM drivers.recruits r
    WHERE r.last_scan < (NOW() - INTERVAL '48 hours')
      AND r.status = 'ACTIVE'
    ORDER BY r.raw_potential_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_stale_recruits(integer) IS 'Returns a list of ACTIVE recruits not scanned in the last 48 hours, prioritized by Raw Potential Score (RPoS).';
