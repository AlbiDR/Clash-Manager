-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Fix Tournament Discovery Trophy Pre-filter
 *
 * Root Cause: tournament-finder.ts was filtering tournament members using
 * m.trophies >= required_trophies (7500). In the CR tournament API, the
 * 'trophies' field in a tournament membersList is the player's tournament
 * score for that specific tournament, NOT their ladder trophy count. This
 * caused 100% of tournament members to be silently filtered out, producing
 * zero TOURNAMENT candidates across every scan cycle.
 *
 * This migration restores the discovery_anchors function to its original form
 * (without the erroneous length >= 3 guard that was added during a now-reverted
 * misdiagnosis), and documents the actual invariant for future reference.
 */

-- Restore get_active_discovery_anchors to its correct original form:
-- no keyword length guard (single-char keywords are valid per CR API),
-- improved tie-breaking by priority column.
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
   Trophy gating is handled downstream in the profiler stage (full profile fetch), not here.';
