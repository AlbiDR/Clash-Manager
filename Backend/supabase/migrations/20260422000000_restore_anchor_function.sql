-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Restore Discovery Anchor Function
 *
 * The previous migration incorrectly added a `length(keyword) >= 3` guard to
 * get_active_discovery_anchors. Single-character keywords are valid per the CR
 * tournament API and have historically produced healthy scouting yield.
 *
 * This migration removes that guard and restores the correct function.
 * It also re-enables single-char anchors that were incorrectly disabled.
 */

-- Ensure all single-char anchors are active (idempotent)
UPDATE substrate.discovery_anchors
SET status = 'ACTIVE'
WHERE length(keyword) < 3 AND status = 'DISABLED';

-- Restore get_active_discovery_anchors without the erroneous length guard
CREATE OR REPLACE FUNCTION substrate.get_active_discovery_anchors(p_limit integer DEFAULT 15)
RETURNS TABLE(keyword text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = substrate
AS $$
BEGIN
    RETURN QUERY
    (
        -- Priority 1: High Yield - top performers by total yield
        SELECT da.keyword
        FROM substrate.discovery_anchors da
        WHERE da.status = 'ACTIVE'
        ORDER BY da.total_yield DESC, da.priority DESC
        LIMIT (p_limit / 3)
    )
    UNION
    (
        -- Priority 2: Exploration - least recently scanned to ensure full rotation
        SELECT da.keyword
        FROM substrate.discovery_anchors da
        WHERE da.status = 'ACTIVE'
        ORDER BY da.last_scanned_at ASC NULLS FIRST, da.priority DESC
        LIMIT (p_limit - (p_limit / 3))
    );
END;
$$;

COMMENT ON FUNCTION substrate.get_active_discovery_anchors(integer) IS
  'Returns a balanced mix of high-yield and least-recently-scanned active discovery anchors.
   Single-character keywords are valid; CR tournament API accepts them without restriction.
   Trophy gating is handled downstream in the profiler stage via full profile fetch.';
