-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Stale Recruits Status Fix
 * 
 * Modifies public.get_stale_recruits to fetch not just 'ACTIVE' recruits, 
 * but also 'BENCHED' and 'QUEUE' recruits. This ensures players who drop 
 * below thresholds or get benched are still monitored and can recover
 * their ACTIVE status without getting permanently stuck.
 */

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
      AND r.status IN ('ACTIVE', 'BENCHED', 'QUEUE')
    ORDER BY 
      CASE r.status 
           WHEN 'ACTIVE' THEN 1
           WHEN 'BENCHED' THEN 2
           WHEN 'QUEUE' THEN 3
           ELSE 4 END ASC,
      r.last_scan ASC, 
      r.raw_potential_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_stale_recruits(integer) IS 'Returns stale recruits (ACTIVE, BENCHED, QUEUE) not scanned in 48h, prioritizing ACTIVE ones with oldest scans.';
