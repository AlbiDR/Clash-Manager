-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Headhunter Ghost Eviction & Resilience
 * Phase 6: Automatic Blacklisting of Invalid (404) Player Tags
 * 
 * This migration implements the server-side logic for handling "ghost" recruits
 * who no longer exist in the RoyaleAPI/Supercell database.
 */

BEGIN;

-- 1. RPC: public.report_dead_recruit
-- Handled when the scanner receives a 404 for a player tag.
CREATE OR REPLACE FUNCTION public.report_dead_recruit(p_player_tag TEXT)
RETURNS VOID AS $$
DECLARE
    v_recruit RECORD;
BEGIN
    -- 1. Check if the recruit exists
    SELECT * INTO v_recruit FROM drivers.recruits WHERE player_tag = p_player_tag;

    -- 2. Log to Ledger
    INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
    VALUES (
        p_player_tag,
        COALESCE(v_recruit.player_name, 'Unknown'),
        'GHOST_DETECTED',
        COALESCE(v_recruit.raw_potential_score, 0.0),
        0.0,
        'Player profile returned 404 (Not Found). Automatic eviction and blacklisting initiated.'
    );

    -- 3. Blacklist the tag (shorter TTL than standard dismissal)
    INSERT INTO drivers.recruit_blacklist (player_tag, player_name, raw_potential_score, reason, expires_at)
    VALUES (
        p_player_tag,
        COALESCE(v_recruit.player_name, 'Ghost'),
        COALESCE(v_recruit.raw_potential_score, 0.0),
        'GHOST_404',
        NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (player_tag) DO UPDATE SET
        expires_at = NOW() + INTERVAL '7 days',
        reason = 'GHOST_404';

    -- 4. Delete from active queue
    DELETE FROM drivers.recruits WHERE player_tag = p_player_tag;

    -- 5. Telemetry
    INSERT INTO substrate.governance_telemetry (event_type, status, message)
    VALUES ('GHOST_EVICTION', 'INFO', 'Evicted and blacklisted ghost recruit: ' || p_player_tag);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.report_dead_recruit(TEXT) IS 'Evicts a 404-ing player from the recruitment pool and blacklists them for 7 days.';

-- 2. MAINTENANCE: substrate.purge_clanned_recruits (Enhancement)
-- Ensure we log to telemetry the results of the clanned purge
CREATE OR REPLACE FUNCTION substrate.purge_clanned_recruits()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_rec   RECORD;
BEGIN
    FOR v_rec IN
        SELECT r.player_tag, r.player_name, r.raw_potential_score
        FROM   drivers.recruits r
        INNER JOIN drivers.members m ON m.player_tag = r.player_tag
    LOOP
        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
        VALUES (
            v_rec.player_tag,
            v_rec.player_name,
            'JOINED_US',
            v_rec.raw_potential_score,
            v_rec.raw_potential_score,
            'Recruit joined the clan; auto-purged from headhunter queue.'
        );

        DELETE FROM drivers.recruits WHERE player_tag = v_rec.player_tag;
        v_count := v_count + 1;
    END LOOP;

    IF v_count > 0 THEN
        INSERT INTO substrate.governance_telemetry (event_type, status, message)
        VALUES ('CLANNED_PURGE', 'SUCCESS', 'Auto-evicted ' || v_count || ' recruits who joined our clans.');
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
