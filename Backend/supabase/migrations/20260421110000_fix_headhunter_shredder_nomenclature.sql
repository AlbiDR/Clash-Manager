-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [FIX] Headhunter Shredder Nomenclature Alignment
-- This migration fixes the shred_scout_logs function to use the renamed columns:
-- player_tag (was tag) and player_name (was name) in the drivers.recruits table.

BEGIN;

CREATE OR REPLACE FUNCTION substrate.shred_scout_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = substrate, drivers, public
AS $$
DECLARE
    v_recruit RECORD;
    v_items JSONB;
    v_required_trophies INTEGER;
    v_managed_clan_tag TEXT;
BEGIN
    -- Get clan floor for status assignment (ACTIVE vs QUEUE)
    SELECT clan_tag, COALESCE(required_trophies, 0) 
    INTO v_managed_clan_tag, v_required_trophies
    FROM drivers.clans 
    LIMIT 1;

    -- Extract items from payload (handles both array and {items: []} shapes)
    v_items := CASE 
        WHEN jsonb_typeof(NEW.payload) = 'array' THEN NEW.payload
        WHEN NEW.payload ? 'items' AND jsonb_typeof(NEW.payload->'items') = 'array' THEN NEW.payload->'items'
        ELSE NULL
    END;

    IF v_items IS NULL THEN RETURN NEW; END IF;

    FOR v_recruit IN 
        SELECT * FROM jsonb_to_recordset(v_items) AS x(
            tag TEXT, 
            name TEXT, 
            trophies INTEGER, 
            donations INTEGER,
            war INTEGER,
            "rawScore" NUMERIC
        )
    LOOP
        -- Skip blacklisted players
        IF NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist WHERE player_tag = v_recruit.tag) THEN
            
            INSERT INTO drivers.recruits (
                player_tag, 
                player_name, 
                trophies, 
                donations, 
                war_wins, 
                raw_potential_score, 
                source, 
                status, 
                found_date, 
                last_scan
            )
            VALUES (
                v_recruit.tag, 
                v_recruit.name, 
                COALESCE(v_recruit.trophies, 0),
                COALESCE(v_recruit.donations, 0),
                COALESCE(v_recruit.war, 0),
                -- Calculate potential score using authoritative formula: 
                -- Trophies(1x) + Donations(0.1x) + (WarWins+500)*20
                COALESCE(v_recruit."rawScore", (
                    (COALESCE(v_recruit.trophies, 0) * 1.0) + 
                    (COALESCE(v_recruit.donations, 0) * 0.1) + 
                    ((COALESCE(v_recruit.war, 0) + 500) * 20.0)
                )),
                NEW.source,
                CASE 
                    WHEN COALESCE(v_recruit.trophies, 0) < v_required_trophies THEN 'QUEUE'::drivers.recruit_status 
                    ELSE 'ACTIVE'::drivers.recruit_status 
                END,
                NOW(),
                NOW()
            )
            ON CONFLICT (player_tag) DO UPDATE SET
                trophies = EXCLUDED.trophies,
                donations = EXCLUDED.donations,
                war_wins = EXCLUDED.war_wins,
                raw_potential_score = GREATEST(drivers.recruits.raw_potential_score, EXCLUDED.raw_potential_score),
                source = EXCLUDED.source,
                -- Only promote status, never demote from ARCHIVED back to ACTIVE automatically 
                -- unless they now meet the trophy floor.
                status = CASE 
                    WHEN EXCLUDED.trophies >= v_required_trophies AND drivers.recruits.status = 'QUEUE' THEN 'ACTIVE'::drivers.recruit_status
                    WHEN EXCLUDED.trophies < v_required_trophies AND drivers.recruits.status = 'ACTIVE' THEN 'QUEUE'::drivers.recruit_status
                    ELSE drivers.recruits.status 
                END,
                last_scan = NOW();
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMIT;
