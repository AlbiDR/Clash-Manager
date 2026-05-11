-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- HARDEN: sync_recruits RPC – Ensure players registry existence
--
-- Root Cause:
-- The sync_recruits RPC was failing with FK violations (fk_recruits_player) 
-- because newly discovered player_tags were not present in drivers.players.
--
-- Fix:
-- 1. Perform an upstream upsert into drivers.players for all tags in the batch.
-- 2. Maintain strict temporal consistency with EXCLUDED.player_name updates.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID AS $$
BEGIN
    -- 1. Upstream: Ensure all players exist in the universal registry to satisfy FK
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT 
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET 
        player_name = EXCLUDED.player_name,
        updated_at  = NOW();

    -- 2. Downstream: Upsert recruit metrics
    INSERT INTO drivers.recruits (
        player_tag,
        player_name,
        trophies,
        donations,
        war_wins,
        cards,
        raw_potential_score,
        source,
        status,
        last_scan
    )
    SELECT
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT,
        (val->>'trophies')::INTEGER,
        COALESCE((val->>'donations')::INTEGER, 0),
        COALESCE((val->>'war_wins')::INTEGER, 0),
        COALESCE((val->>'cards')::INTEGER, 0),
        COALESCE((val->>'raw_potential_score')::NUMERIC, 0),
        (val->>'source')::TEXT,
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name         = EXCLUDED.player_name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        war_wins            = EXCLUDED.war_wins,
        cards               = EXCLUDED.cards,
        raw_potential_score = CASE
            WHEN EXCLUDED.raw_potential_score > 0
            THEN EXCLUDED.raw_potential_score
            ELSE drivers.recruits.raw_potential_score
        END,
        source              = EXCLUDED.source,
        status              = EXCLUDED.status,
        last_scan           = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
