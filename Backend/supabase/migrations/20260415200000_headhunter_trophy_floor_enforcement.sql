-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
HEADHUNTER TROPHY FLOOR ENFORCEMENT
----------------------------------------------------------------------------
Implements a non-negotiable bottom floor for recruitment based on the 
clan's in-game required trophies. 

1. Updates the shredder to bench low-trophy discoveries.
2. Provides a maintenance function to sweep the existing pool.
============================================================================
*/

-- 1. Redefine the Shredder with Trophy Guard
CREATE OR REPLACE FUNCTION substrate.shred_scout_logs()
RETURNS TRIGGER AS $$
DECLARE
    v_recruit RECORD;
    v_items JSONB;
    v_required_trophies INTEGER;
    v_managed_clan_tag TEXT;
BEGIN
    -- A. Context Acquisition: Identify the managed clan and its requirements
    -- In single-clan systems, we fetch the first available record from drivers.clans.
    SELECT tag, COALESCE(required_trophies, 0) 
    INTO v_managed_clan_tag, v_required_trophies
    FROM drivers.clans 
    LIMIT 1;

    -- Polymorphic payload detection (RoyaleAPI items or raw array)
    v_items := CASE 
        WHEN jsonb_typeof(NEW.payload) = 'array' THEN NEW.payload
        WHEN NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN NEW.payload->'items'
        ELSE NULL
    END;

    IF v_items IS NULL THEN RETURN NEW; END IF;

    -- B. Transactional Ingestion
    FOR v_recruit IN 
        SELECT * FROM jsonb_to_recordset(v_items) AS x(
            tag TEXT, name TEXT, trophies INTEGER, totalDonations INTEGER, donations INTEGER,
            challengeCardsWon INTEGER, cards INTEGER, warDayWins INTEGER, war INTEGER,
            rawScore NUMERIC
        )
    LOOP
        -- 1. Blacklist Check (Security Priority)
        IF NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE tag = v_recruit.tag) THEN
            
            -- 2. Trophy Floor Guard (Operational Priority)
            -- If player is below requirement, they are entered as 'BENCHED' immediately.
            -- If player is above/equal, they are entered as 'ACTIVE' (if they are new).
            
            INSERT INTO drivers.recruits (
                tag, name, trophies, donations, cards, war_wins, 
                raw_score, source, status, found_date, last_scan
            )
            VALUES (
                v_recruit.tag, 
                v_recruit.name, 
                COALESCE(v_recruit.trophies, 0),
                COALESCE(v_recruit.totalDonations, v_recruit.donations, 0),
                COALESCE(v_recruit.challengeCardsWon, v_recruit.cards, 0),
                COALESCE(v_recruit.warDayWins, v_recruit.war, 0),
                COALESCE(v_recruit.rawScore, 0.0),
                NEW.source,
                CASE WHEN COALESCE(v_recruit.trophies, 0) < v_required_trophies THEN 'BENCHED' ELSE 'ACTIVE' END,
                NOW(),
                NOW()
            )
            ON CONFLICT (tag) DO UPDATE SET
                trophies = EXCLUDED.trophies,
                donations = EXCLUDED.donations,
                cards = EXCLUDED.cards,
                war_wins = EXCLUDED.war_wins,
                raw_score = GREATEST(drivers.recruits.raw_score, EXCLUDED.raw_score),
                -- Only flip to BENCHED if they drop below floor. 
                -- Do NOT flip from INVITED back to ACTIVE here (state machine preservation).
                status = CASE 
                    WHEN EXCLUDED.trophies < v_required_trophies THEN 'BENCHED'
                    ELSE drivers.recruits.status 
                END,
                last_scan = NOW();
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Maintenance Utility: Clinical Pool Sweep
CREATE OR REPLACE FUNCTION drivers.bench_underqualified_recruits()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
    v_required_trophies INTEGER;
BEGIN
    -- Fetch the authoritative floor
    SELECT COALESCE(required_trophies, 0) INTO v_required_trophies FROM drivers.clans LIMIT 1;
    
    WITH affected_rows AS (
        UPDATE drivers.recruits
        SET status = 'BENCHED',
            last_scan = NOW()
        WHERE trophies < v_required_trophies
        AND status != 'BENCHED'
        RETURNING tag
    )
    SELECT count(*) INTO v_count FROM affected_rows;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION drivers.bench_underqualified_recruits IS 'Benches all recruits currently in the pool who fall below the authoritative trophy requirement.';
