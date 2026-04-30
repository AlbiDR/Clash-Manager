-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- 5. Hardening the Shredder Gatekeep
-- This is the "Dual Gate" - scanner can never see blacklisted tags.
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

    -- Gatekeeper Logic: Filter out blacklisted tags BEFORE insertion
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
        -- THE SHIELD: If they are blacklisted, they don't even reach the table.
        SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.tag = r.tag
    )
    ON CONFLICT (tag) DO UPDATE SET
        name                = EXCLUDED.name,
        trophies            = EXCLUDED.trophies,
        donations           = EXCLUDED.donations,
        cards               = EXCLUDED.cards,
        war_wins            = EXCLUDED.war_wins,
        raw_potential_score = GREATEST(drivers.recruits.raw_potential_score, EXCLUDED.raw_potential_score, 0),
        last_scan           = NOW();

    RETURN NEW;
END;
$function$;
