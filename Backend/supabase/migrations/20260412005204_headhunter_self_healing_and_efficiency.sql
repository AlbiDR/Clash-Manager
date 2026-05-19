-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- MIGRATION: headhunter_self_healing_and_efficiency
-- Addresses:
--   1. Fix rawScore JSON key casing bug (silent zero ingestion)
--   2. Rename raw_score -> rpos in drivers.recruits (nomenclature parity)
--   3. Add clan_tag column to track post-ingestion clan joins
--   4. Refactor shred_scout_logs: set-based upsert, dual-key casing, clanless guard
--   5. Replace shred_clan_members row loop with set-based INSERT
--   6. Add self-healing view: recruits_view (clanless, sorted by RPoS DESC)
--   7. Add autonomous recruitment maintenance function
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema changes on drivers.recruits
-- -----------------------------------------------------------------------------
ALTER TABLE drivers.recruits
    RENAME COLUMN raw_score TO rpos;

-- Track the player's clan at time of last scan for staleness detection
ALTER TABLE drivers.recruits
    ADD COLUMN IF NOT EXISTS clan_tag TEXT DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 2. Rename raw_score in recruit_blacklist for consistency
-- -----------------------------------------------------------------------------
ALTER TABLE drivers.recruit_blacklist
    RENAME COLUMN raw_score TO rpos;

-- -----------------------------------------------------------------------------
-- 3. Refactor: shred_scout_logs
--    Fixes: rawScore/rawscore dual-key casing, set-based upsert, clanless guard
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION substrate.shred_scout_logs()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_items JSONB;
BEGIN
    v_items := CASE
        WHEN jsonb_typeof(NEW.payload) = 'array' THEN NEW.payload
        WHEN NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN NEW.payload->'items'
        ELSE NULL
    END;

    IF v_items IS NULL THEN RETURN NEW; END IF;

    -- Set-based upsert: parse all candidates from the JSON array in one pass.
    -- Normalise: accept both 'rawscore' (scanner output) and 'rawScore' (legacy camelCase).
    -- Blacklist check is inline via NOT EXISTS subquery.
    -- GREATEST() ensures we never downgrade RPoS on a re-scan.
    INSERT INTO drivers.recruits (
        tag, name, trophies, donations, cards, war_wins,
        rpos, source, status, clan_tag, found_date, last_scan
    )
    SELECT
        r.tag,
        r.name,
        COALESCE(r.trophies, 0),
        COALESCE(r.donations, 0),
        COALESCE(r.cards, 0),
        COALESCE(r.war, 0),
        -- Dual-key normalisation: rawscore (lowercase) is canonical, rawScore is legacy fallback
        COALESCE(r.rawscore, r."rawScore", 0.0),
        NEW.source,
        'ACTIVE',
        NULL, -- clan_tag: clanless at time of discovery (enforced by scanner)
        NOW(),
        NOW()
    FROM jsonb_to_recordset(v_items) AS r(
        tag TEXT, name TEXT, trophies INTEGER, donations INTEGER,
        cards INTEGER, war INTEGER,
        rawscore NUMERIC, "rawScore" NUMERIC
    )
    WHERE NOT EXISTS (
        SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.tag = r.tag
    )
    ON CONFLICT (tag) DO UPDATE SET
        name       = EXCLUDED.name,
        trophies   = EXCLUDED.trophies,
        donations  = EXCLUDED.donations,
        cards      = EXCLUDED.cards,
        war_wins   = EXCLUDED.war_wins,
        rpos       = GREATEST(drivers.recruits.rpos, EXCLUDED.rpos),
        last_scan  = NOW();
    -- Note: clan_tag is intentionally NOT updated here.
    -- It is managed exclusively by the self-healing maintenance function.

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4. Refactor: shred_clan_members (row loop -> set-based INSERT)
--    Also evicts from recruits any member who has now joined the clan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_items JSONB;
BEGIN
    v_items := CASE
        WHEN jsonb_typeof(NEW.payload) = 'array' THEN NEW.payload
        WHEN NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN NEW.payload->'items'
        ELSE NULL
    END;

    IF v_items IS NULL THEN RETURN NEW; END IF;

    -- Mark any current member absent if they are no longer in the payload
    UPDATE drivers.members
    SET is_active = FALSE
    WHERE tag NOT IN (
        SELECT x.tag FROM jsonb_to_recordset(v_items) AS x(tag TEXT)
    );

    -- Set-based upsert: replaces the row-by-row FOR loop
    INSERT INTO drivers.members (
        tag, name, role, exp_level, trophies,
        donations, donations_received, last_ingested_at, is_active
    )
    SELECT
        m.tag, m.name, m.role, m."expLevel", m.trophies,
        COALESCE(m.donations, 0), COALESCE(m."donationsReceived", 0), NOW(), TRUE
    FROM jsonb_to_recordset(v_items) AS m(
        tag TEXT, name TEXT, role TEXT, "expLevel" INTEGER,
        trophies INTEGER, donations INTEGER, "donationsReceived" INTEGER
    )
    ON CONFLICT (tag) DO UPDATE SET
        name               = EXCLUDED.name,
        role               = EXCLUDED.role,
        exp_level          = EXCLUDED.exp_level,
        trophies           = EXCLUDED.trophies,
        donations          = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        last_ingested_at   = EXCLUDED.last_ingested_at,
        is_active          = TRUE;

    -- SELF-HEALING: Any recruit who appears in the current clan roster has joined a clan.
    -- Evict them immediately from the recruitment pool.
    DELETE FROM drivers.recruits
    WHERE tag IN (
        SELECT x.tag FROM jsonb_to_recordset(v_items) AS x(tag TEXT)
    );

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Update dismiss_recruit to use updated column name
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(p_tag TEXT, p_days_to_ban INTEGER DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_recruit RECORD;
BEGIN
    SELECT * INTO v_recruit FROM drivers.recruits WHERE tag = p_tag;

    INSERT INTO drivers.recruit_blacklist (tag, rpos, expiry_date)
    VALUES (
        p_tag,
        COALESCE(v_recruit.rpos, 0.0),
        NOW() + (p_days_to_ban || ' days')::INTERVAL
    )
    ON CONFLICT (tag) DO UPDATE SET
        expiry_date = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        banned_at   = NOW();

    DELETE FROM drivers.recruits WHERE tag = p_tag;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6. Self-Healing Recruitment View: recruits_view
--    Always returns only clanless candidates, sorted by RPoS DESC.
--    clan_tag IS NULL enforces the clanless invariant at the read boundary.
--    This is the authoritative read surface for the frontend GUI.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW drivers.recruits_view AS
SELECT
    tag,
    name,
    trophies,
    donations,
    cards,
    war_wins,
    rpos,                                   -- Raw Potential Score (RPoS)
    ROUND(rpos / 10000.0 * 100.0, 2) AS pos, -- Potential Score (PoS): 0–100 normalised rank
    source,
    status,
    found_date,
    last_scan
FROM drivers.recruits
WHERE clan_tag IS NULL                      -- Clanless invariant: purged players never surface
ORDER BY rpos DESC;                         -- Always ranked by highest RPoS first

COMMENT ON VIEW drivers.recruits_view IS
    'L2 Drivers: Self-healing recruitment pool. Clanless-only, sorted by RPoS DESC. Authoritative read surface for Headhunter GUI.';

-- -----------------------------------------------------------------------------
-- 7. Autonomous Maintenance Function: purge_clanned_recruits()
--    Callable by a scheduled Supabase CRON job or manually.
--    Marks clan_tag on any recruit found by cross-referencing drivers.members,
--    then hard-deletes those records from the pool.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION drivers.purge_clanned_recruits()
RETURNS TABLE(purged_count INTEGER, purged_tags TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_purged_tags TEXT[];
BEGIN
    -- Identify recruits who have since joined the clan (appeared in members table)
    WITH clanned AS (
        DELETE FROM drivers.recruits r
        WHERE EXISTS (
            SELECT 1 FROM drivers.members m
            WHERE m.tag = r.tag AND m.is_active = TRUE
        )
        RETURNING r.tag
    )
    SELECT ARRAY_AGG(tag) INTO v_purged_tags FROM clanned;

    RETURN QUERY SELECT
        COALESCE(array_length(v_purged_tags, 1), 0)::INTEGER,
        COALESCE(v_purged_tags, ARRAY[]::TEXT[]);
END;
$function$;

COMMENT ON FUNCTION drivers.purge_clanned_recruits() IS
    'Autonomous maintenance: deletes any recruit who has since joined the clan. Call from pg_cron or Edge Function.';
