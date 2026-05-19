-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 1. HARDEN STATE SCHEMA: drivers.members
-- Ensure drivers.members is a PURE CURRENT STATE table.
ALTER TABLE drivers.members DROP CONSTRAINT IF EXISTS members_tag_date_unique;
ALTER TABLE drivers.members DROP CONSTRAINT IF EXISTS members_tag_snapshot_date_key;
-- Remove snapshot_date from members (it belongs in member_snapshots)
-- ALTER TABLE drivers.members DROP COLUMN IF EXISTS snapshot_date; -- Keeping it for now but ignoring it in logic for BC.

-- 2. CLINICAL SHREDDER: River Race (Stage 3)
CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO drivers.war_activity (member_tag, fame, decks_used)
    SELECT 
        (elem->>'tag')::TEXT,
        (elem->>'fame')::INTEGER,
        (elem->>'decksUsed')::INTEGER
    FROM jsonb_extract_path(NEW.payload, 'clan', 'participants') AS elem
    WHERE EXISTS (SELECT 1 FROM drivers.members WHERE tag = elem->>'tag')
    ON CONFLICT (member_tag) DO UPDATE SET
        fame = EXCLUDED.fame,
        decks_used = EXCLUDED.decks_used,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_shred_river_race ON substrate.raw_river_race;
CREATE TRIGGER tr_shred_river_race
AFTER INSERT ON substrate.raw_river_race
FOR EACH ROW EXECUTE FUNCTION substrate.shred_river_race();

-- 3. CLINICAL SHREDDER: War Log (Stage 4)
CREATE OR REPLACE FUNCTION substrate.shred_war_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO drivers.war_history (clan_tag, season_id, section_index, fame, rank)
    SELECT 
        (standing->'clan'->>'tag')::TEXT,
        (item->>'seasonId')::INTEGER,
        (item->>'sectionIndex')::INTEGER,
        (standing->'clan'->>'fame')::INTEGER,
        (standing->>'rank')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE standing->'clan'->>'tag' IS NOT NULL
    ON CONFLICT (clan_tag, season_id, section_index) DO UPDATE SET
        fame = EXCLUDED.fame,
        rank = EXCLUDED.rank,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_shred_war_log ON substrate.raw_war_log;
CREATE TRIGGER tr_shred_war_log
AFTER INSERT ON substrate.raw_war_log
FOR EACH ROW EXECUTE FUNCTION substrate.shred_war_log();

-- 4. CLINICAL SHREDDER: Clan Profile (Stage 1)
CREATE OR REPLACE FUNCTION substrate.shred_clan_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Update general clan stats if we had a clan table, 
    -- but currently we just update the specific member row for the clan tag if applicable.
    -- Usually profile is for the clan itself.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. UPGRADED CLINICAL SHREDDER: Clan Members (Stage 2)
-- Dual-Update: drivers.members (State) + drivers.member_snapshots (History) + Self-Healing Eviction
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
BEGIN
    -- A. UPSERT CURRENT STATE (drivers.members)
    INSERT INTO drivers.members (
        tag, name, role, exp_level, trophies, donations, donations_received, 
        last_seen, last_seen_at, updated_at, is_active
    )
    SELECT 
        (elem->>'tag')::TEXT,
        (elem->>'name')::TEXT,
        (elem->>'role')::TEXT,
        (elem->>'expLevel')::INTEGER,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER,
        (elem->>'donationsReceived')::INTEGER,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        (elem->>'lastSeen')::TIMESTAMPTZ,
        NOW(),
        TRUE
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (tag) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies,
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        last_seen = EXCLUDED.last_seen,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at,
        is_active = TRUE;

    -- B. LOG HISTORY (drivers.member_snapshots)
    INSERT INTO drivers.member_snapshots (tag, snapshot_date, trophies, donations)
    SELECT 
        (elem->>'tag')::TEXT,
        CURRENT_DATE,
        (elem->>'trophies')::INTEGER,
        (elem->>'donations')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') AS elem
    ON CONFLICT (tag, snapshot_date) DO NOTHING;

    -- C. SELF-HEALING: EVICT FROM RECRUITS (Member Detection)
    -- If they are in our clan, they are no longer recruits.
    DELETE FROM drivers.recruits
    WHERE tag IN (
        SELECT (elem->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items')
    );

    -- D. MAINTENANCE: Mark leavers (not in this payload) as inactive
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = NOW()
    WHERE tag NOT IN (
        SELECT (elem->>'tag')::TEXT 
        FROM jsonb_array_elements(NEW.payload->'items')
    )
    AND is_active = TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Final cleanup of older procedural RPCs to prevent confusion
-- (We keep them for compatibility but they are now shadowed by triggers)
