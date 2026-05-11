-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
CLINICAL PIPELINE STABILIZATION
----------------------------------------------------------------------------
1. Hardens sync_recruits to prevent metric nullification.
2. Fixes get_headhunter_context to allow updating existing recruits.
3. Executes a surgical purge of all corrupted "ghost" records.
============================================================================
*/

-- 1. Hardened sync_recruits (Metric-Safe Upsert)
CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID AS $$
BEGIN
    -- A. Ensure all players exist in the universal registry (FK Safety)
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT 
        (val->>'player_tag')::TEXT,
        (val->>'player_name')::TEXT
    FROM jsonb_array_elements(p_recruits) AS val
    ON CONFLICT (player_tag) DO UPDATE
    SET 
        player_name = EXCLUDED.player_name,
        updated_at  = NOW();

    -- B. Upsert recruit metrics with strict COALESCE guards
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
        COALESCE((val->>'trophies')::INTEGER, 0),
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
$$ LANGUAGE plpgsql;

-- 2. Fixed get_headhunter_context (Allow Updates)
CREATE OR REPLACE FUNCTION public.get_headhunter_context()
RETURNS JSONB AS $$
DECLARE
    v_required_trophies INTEGER;
    v_exclusion_tags    TEXT[];
BEGIN
    SELECT COALESCE(required_trophies, 0)
    INTO v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    -- ONLY exclude players who are already MEMBERS or explicitly BLACKLISTED.
    -- We removed drivers.recruits from this list to allow the profiler to update existing ones.
    SELECT array_agg(DISTINCT player_tag)
    INTO v_exclusion_tags
    FROM (
        SELECT player_tag FROM drivers.recruit_blacklist
        UNION
        SELECT player_tag FROM drivers.members
    ) exclusions
    WHERE player_tag IS NOT NULL;

    RETURN jsonb_build_object(
        'required_trophies', COALESCE(v_required_trophies, 0),
        'exclusion_tags',    COALESCE(v_exclusion_tags, ARRAY[]::TEXT[])
    );
END;
$$ LANGUAGE plpgsql;

-- 3. Surgical Purge of Corrupted Data
DELETE FROM drivers.recruits 
WHERE trophies IS NULL 
   OR trophies = 0 
   OR raw_potential_score = 0;

-- 4. Consolidate Maintenance Logic
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
RETURNS VOID AS $$
BEGIN
    -- Purge clanned recruits ( authoritative )
    PERFORM substrate.purge_clanned_recruits();
    
    -- Bench underqualified recruits ( based on clan floor )
    PERFORM drivers.bench_underqualified_recruits();
    
    -- Clinical purge of ghost records
    DELETE FROM drivers.recruits 
    WHERE trophies IS NULL 
       OR trophies = 0 
       OR raw_potential_score = 0;

    -- Cleanup stale discovery logs
    DELETE FROM substrate.scout_logs WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
