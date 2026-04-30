
-- =============================================================================
-- MIGRATION: headhunter_full_nomenclature_rpos_pos
-- Rename rpos -> raw_potential_score across the full recruits pipeline.
-- Mirrors roster_view naming: raw_performance_score / performance_score.
-- =============================================================================

-- 1. Drop dependent view first (blocks the column rename)
DROP VIEW IF EXISTS drivers.recruits_view;

-- 2. Rename column in tables
ALTER TABLE drivers.recruits
    RENAME COLUMN rpos TO raw_potential_score;

ALTER TABLE drivers.recruit_blacklist
    RENAME COLUMN rpos TO raw_potential_score;

-- 3. Rebuild shred_scout_logs with corrected column name
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

    INSERT INTO drivers.recruits (
        tag, name, trophies, donations, cards, war_wins,
        raw_potential_score, source, status, clan_tag, found_date, last_scan
    )
    SELECT
        r.tag,
        r.name,
        COALESCE(r.trophies, 0),
        COALESCE(r.donations, 0),
        COALESCE(r.cards, 0),
        COALESCE(r.war, 0),
        COALESCE(r.rawscore, r."rawScore", 0.0),
        NEW.source,
        'ACTIVE',
        NULL,
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
        name                = EXCLUDED.name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        cards               = EXCLUDED.cards,
        war_wins            = EXCLUDED.war_wins,
        raw_potential_score = GREATEST(drivers.recruits.raw_potential_score, EXCLUDED.raw_potential_score),
        last_scan           = NOW();

    RETURN NEW;
END;
$function$;

-- 4. Rebuild dismiss_recruit with corrected column name
CREATE OR REPLACE FUNCTION drivers.dismiss_recruit(p_tag TEXT, p_days_to_ban INTEGER DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_recruit RECORD;
BEGIN
    SELECT * INTO v_recruit FROM drivers.recruits WHERE tag = p_tag;

    INSERT INTO drivers.recruit_blacklist (tag, raw_potential_score, expiry_date)
    VALUES (
        p_tag,
        COALESCE(v_recruit.raw_potential_score, 0.0),
        NOW() + (p_days_to_ban || ' days')::INTERVAL
    )
    ON CONFLICT (tag) DO UPDATE SET
        expiry_date = NOW() + (p_days_to_ban || ' days')::INTERVAL,
        banned_at   = NOW();

    DELETE FROM drivers.recruits WHERE tag = p_tag;
END;
$function$;

-- 5. Recreate recruits_view with full nomenclature, mirroring roster_view
CREATE OR REPLACE VIEW drivers.recruits_view AS
SELECT
    tag,
    name,
    trophies,
    donations,
    cards,
    war_wins,
    raw_potential_score,                                                   -- RPoS: Raw Potential Score
    ROUND(raw_potential_score / 10000.0 * 100.0, 2) AS potential_score,   -- PoS:  Potential Score (0-100)
    source,
    status,
    found_date,
    last_scan
FROM drivers.recruits
WHERE clan_tag IS NULL
ORDER BY raw_potential_score DESC;

COMMENT ON VIEW drivers.recruits_view IS
    'L2 Drivers: Self-healing recruitment pool. Clanless-only, sorted by raw_potential_score DESC. Naming mirrors features.roster_view (raw_performance_score / performance_score).';

-- 6. Rebuild purge_clanned_recruits (rebuild for completeness)
CREATE OR REPLACE FUNCTION drivers.purge_clanned_recruits()
RETURNS TABLE(purged_count INTEGER, purged_tags TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_purged_tags TEXT[];
BEGIN
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
