-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FIX: sync_recruits RPC – persist all profiler metrics
--
-- Root Cause:
-- The current sync_recruits (20260502162500) only upserts:
--   player_tag, player_name, trophies, source, status, last_scan
--
-- The profiler.ts stage calculates and sends raw_potential_score, donations,
-- war_wins, and cards, but these fields were silently dropped on every upsert.
-- As a result:
--   - Newly profiled recruits showed 0/null for all metrics in headhunter_view.
--   - The corpus benchmark (MAX raw_potential_score) was always 0, causing
--     all potential_score / pos values to clamp to 100 or produce NaN.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID AS $$
BEGIN
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
        -- Cast to enum; fallback to 'ACTIVE' so new candidates are immediately visible
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name        = EXCLUDED.player_name,
        trophies           = EXCLUDED.trophies,
        donations          = EXCLUDED.donations,
        war_wins           = EXCLUDED.war_wins,
        cards              = EXCLUDED.cards,
        raw_potential_score = CASE
            WHEN EXCLUDED.raw_potential_score > 0
            THEN EXCLUDED.raw_potential_score
            ELSE drivers.recruits.raw_potential_score
        END,
        source             = EXCLUDED.source,
        status             = EXCLUDED.status,
        last_scan          = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sync_recruits(JSONB) TO authenticated, service_role;

COMMIT;
