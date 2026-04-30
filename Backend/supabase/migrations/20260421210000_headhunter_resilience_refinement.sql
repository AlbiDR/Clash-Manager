-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Headhunter Resilience Refinement
 * Hardens the ghost eviction mechanism and standardizes stage isolation.
 */

BEGIN;

-- 1. Refine public.report_dead_recruit
-- Now targets the universal drivers.players registry for cascading cleanup.
CREATE OR REPLACE FUNCTION public.report_dead_recruit(p_player_tag TEXT)
RETURNS VOID AS $$
DECLARE
    v_player_name TEXT;
    v_raw_score NUMERIC;
BEGIN
    -- 1. Capture details from registry or recruits before deletion
    SELECT 
        COALESCE(r.player_name, p.player_name, 'Unknown'),
        COALESCE(r.raw_potential_score, 0.0)
    INTO v_player_name, v_raw_score
    FROM drivers.players p
    LEFT JOIN drivers.recruits r ON r.player_tag = p.player_tag
    WHERE p.player_tag = p_player_tag;

    -- 2. Log to Ledger (using captured details)
    INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Unknown'),
        'GHOST_DETECTED',
        COALESCE(v_raw_score, 0.0),
        0.0,
        'Player profile returned 404 (Not Found). Universal registry eviction and blacklisting initiated.'
    );

    -- 3. Blacklist the tag (shorter TTL than standard dismissal)
    INSERT INTO drivers.recruit_blacklist (player_tag, player_name, raw_potential_score, reason, expires_at)
    VALUES (
        p_player_tag,
        COALESCE(v_player_name, 'Ghost'),
        COALESCE(v_raw_score, 0.0),
        'GHOST_404',
        NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + INTERVAL '7 days',
        reason = 'GHOST_404';

    -- 4. Delete from Universal Registry (CASCADES to recruits, player_battles, members)
    DELETE FROM drivers.players WHERE player_tag = p_player_tag;

    -- 5. Telemetry
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('GHOST_EVICTION', 'INFO', 'Universal eviction of ghost player: ' || p_player_tag);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
