-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
HEADHUNTER CONTEXT RPC
----------------------------------------------------------------------------
Provides a high-performance, single-call endpoint for the Headhunter 
Edge Function to receive its operational parameters (trophy floor) and 
exclusion lists (blacklist, current members, existing active recruits) 
before executing a scan.
============================================================================
*/

CREATE OR REPLACE FUNCTION public.get_headhunter_context()
RETURNS JSONB AS $$
DECLARE
    v_required_trophies INTEGER;
    v_exclusion_tags TEXT[];
BEGIN
    -- 1. Get Trophy Floor
    SELECT COALESCE(required_trophies, 0)
    INTO v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    -- 2. Aggregate Exclusion List
    -- Exclude:
    -- A. Players already in the Blacklist
    -- B. Players currently in the Clan (members)
    -- C. Players already in the Recruits pool (ACTIVE/BENCHED/INVITED)
    SELECT array_agg(DISTINCT tag)
    INTO v_exclusion_tags
    FROM (
        SELECT tag FROM drivers.recruit_blacklist
        UNION
        SELECT tag FROM drivers.members
        UNION
        SELECT tag FROM drivers.recruits
    ) exclusions
    WHERE tag IS NOT NULL;

    -- 3. Return JSON structure
    RETURN jsonb_build_object(
        'required_trophies', COALESCE(v_required_trophies, 0),
        'exclusion_tags', COALESCE(v_exclusion_tags, ARRAY[]::TEXT[])
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to public/authenticated for Edge Function access
GRANT EXECUTE ON FUNCTION public.get_headhunter_context() TO anon, authenticated;
