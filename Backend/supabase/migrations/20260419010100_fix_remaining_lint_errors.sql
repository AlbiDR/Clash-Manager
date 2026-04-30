-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
LINT CORRECTION — ROUND 2
----------------------------------------------------------------------------
  1. public.ingest_clan_profile
       ON CONFLICT (tag) → ON CONFLICT (tag, snapshot_date)
       The unique constraint on drivers.clans is clans_tag_date_unique(tag, snapshot_date).

  2. substrate.execute_nightly_maintenance
       Calls substrate.purge_expired_blacklist() which does not exist.
       The function lives in the drivers schema: drivers.purge_expired_blacklist().
============================================================================
*/

-- ==========================================================================
-- 1. FIX: public.ingest_clan_profile — correct ON CONFLICT columns
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.ingest_clan_profile(p_payload JSONB)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public, drivers, substrate
AS $$
BEGIN
    -- L0: Preserve raw payload for audit trail
    INSERT INTO substrate.raw_clan_profile (payload) VALUES (p_payload);

    -- L2: Shred into drivers.clans (clan-level metadata)
    INSERT INTO drivers.clans (
        tag,
        name,
        description,
        badge_id,
        member_count,
        required_trophies,
        type,
        last_ingested_at,
        snapshot_date
    )
    VALUES (
        p_payload->>'tag',
        p_payload->>'name',
        p_payload->>'description',
        (p_payload->>'badgeId')::INTEGER,
        (p_payload->>'members')::INTEGER,
        (p_payload->>'requiredTrophies')::INTEGER,
        p_payload->>'type',
        NOW(),
        CURRENT_DATE
    )
    ON CONFLICT (tag, snapshot_date) DO UPDATE SET
        name              = EXCLUDED.name,
        description       = EXCLUDED.description,
        badge_id          = EXCLUDED.badge_id,
        member_count      = EXCLUDED.member_count,
        required_trophies = EXCLUDED.required_trophies,
        type              = EXCLUDED.type,
        last_ingested_at  = EXCLUDED.last_ingested_at,
        updated_at        = NOW();
END;
$$;

COMMENT ON FUNCTION public.ingest_clan_profile(JSONB) IS
  'Stores raw clan profile payload and shreds clan-level metadata into drivers.clans on (tag, snapshot_date).';


-- ==========================================================================
-- 2. FIX: substrate.execute_nightly_maintenance
--    substrate.purge_expired_blacklist() → drivers.purge_expired_blacklist()
-- ==========================================================================
CREATE OR REPLACE FUNCTION substrate.execute_nightly_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = substrate, drivers, public
AS $$
BEGIN
    -- Remove recruits who joined the clan
    PERFORM substrate.purge_clanned_recruits();
    -- Remove recruits from the blacklist whose ban has expired (lives in drivers schema)
    PERFORM drivers.purge_expired_blacklist();
    -- Remove stale tournament discovery cache entries
    PERFORM substrate.purge_stale_discovery_cache();
    -- Remove stale heritage records for long-absent members
    PERFORM substrate.purge_stale_heritage();
END;
$$;

COMMENT ON FUNCTION substrate.execute_nightly_maintenance() IS
  'Orchestrates all nightly purge operations: clanned recruits, expired bans, stale discovery cache, and stale heritage.';
