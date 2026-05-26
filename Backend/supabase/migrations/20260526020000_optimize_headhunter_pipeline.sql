-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. Create indexes to speed up status-based and score-based reads
CREATE INDEX IF NOT EXISTS idx_recruits_status ON drivers.recruits(status);
CREATE INDEX IF NOT EXISTS idx_recruits_status_rpos ON drivers.recruits(status, raw_potential_score DESC);

-- 2. Create parallel cached exclusion list table
CREATE TABLE IF NOT EXISTS drivers.exclusion_cache (
    player_tag TEXT PRIMARY KEY
);

-- 3. Populate exclusion cache initially
INSERT INTO drivers.exclusion_cache (player_tag)
SELECT tag FROM drivers.recruit_blacklist WHERE tag IS NOT NULL
UNION
SELECT tag FROM drivers.members WHERE tag IS NOT NULL
ON CONFLICT (player_tag) DO NOTHING;

-- 4. Create trigger function to sync exclusion cache
CREATE OR REPLACE FUNCTION drivers.sync_exclusion_cache()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        INSERT INTO drivers.exclusion_cache (player_tag)
        VALUES (NEW.tag)
        ON CONFLICT (player_tag) DO NOTHING;
    ELSIF TG_OP = 'DELETE' THEN
        IF TG_TABLE_NAME = 'members' THEN
            IF NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE tag = OLD.tag) THEN
                DELETE FROM drivers.exclusion_cache WHERE player_tag = OLD.tag;
            END IF;
        ELSIF TG_TABLE_NAME = 'recruit_blacklist' THEN
            IF NOT EXISTS (SELECT 1 FROM drivers.members WHERE tag = OLD.tag) THEN
                DELETE FROM drivers.exclusion_cache WHERE player_tag = OLD.tag;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach triggers to keep the cache synchronized
DROP TRIGGER IF EXISTS trg_members_exclusion_sync ON drivers.members;
CREATE TRIGGER trg_members_exclusion_sync
AFTER INSERT OR UPDATE OR DELETE ON drivers.members
FOR EACH ROW EXECUTE FUNCTION drivers.sync_exclusion_cache();

DROP TRIGGER IF EXISTS trg_blacklist_exclusion_sync ON drivers.recruit_blacklist;
CREATE TRIGGER trg_blacklist_exclusion_sync
AFTER INSERT OR UPDATE OR DELETE ON drivers.recruit_blacklist
FOR EACH ROW EXECUTE FUNCTION drivers.sync_exclusion_cache();

-- 6. Optimize get_headhunter_context to read from the cached table
CREATE OR REPLACE FUNCTION public.get_headhunter_context()
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, drivers
AS $$
DECLARE
    v_required_trophies INTEGER;
    v_exclusion_tags    TEXT[];
BEGIN
    SELECT COALESCE(required_trophies, 0)
    INTO v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    SELECT COALESCE(array_agg(player_tag), ARRAY[]::TEXT[])
    INTO v_exclusion_tags
    FROM drivers.exclusion_cache;

    RETURN jsonb_build_object(
        'required_trophies', COALESCE(v_required_trophies, 0),
        'exclusion_tags',    v_exclusion_tags
    );
END;
$$ LANGUAGE plpgsql;

-- 7. Optimize sync_recruits to prevent unnecessary writes on duplicate scans
CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public, drivers
AS $$
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

    -- B. Upsert recruit metrics with strict payload enforcement and write optimization
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
        (val->>'raw_potential_score')::NUMERIC,
        (val->>'source')::TEXT,
        COALESCE((val->>'status')::drivers.recruit_status, 'ACTIVE'::drivers.recruit_status),
        NOW()
    FROM jsonb_array_elements(p_recruits) AS val
    WHERE (val->>'raw_potential_score') IS NOT NULL
    ON CONFLICT (player_tag) DO UPDATE
    SET
        player_name         = EXCLUDED.player_name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        war_wins            = EXCLUDED.war_wins,
        cards               = EXCLUDED.cards,
        raw_potential_score = EXCLUDED.raw_potential_score,
        source              = EXCLUDED.source,
        status              = EXCLUDED.status,
        last_scan           = NOW()
    WHERE
        drivers.recruits.trophies IS DISTINCT FROM EXCLUDED.trophies OR
        drivers.recruits.donations IS DISTINCT FROM EXCLUDED.donations OR
        drivers.recruits.war_wins IS DISTINCT FROM EXCLUDED.war_wins OR
        drivers.recruits.cards IS DISTINCT FROM EXCLUDED.cards OR
        drivers.recruits.raw_potential_score IS DISTINCT FROM EXCLUDED.raw_potential_score OR
        drivers.recruits.status IS DISTINCT FROM EXCLUDED.status OR
        drivers.recruits.last_scan < NOW() - INTERVAL '15 minutes';
END;
$$ LANGUAGE plpgsql;

-- 8. Set table permissions
GRANT SELECT ON drivers.exclusion_cache TO authenticated, anon, service_role;
