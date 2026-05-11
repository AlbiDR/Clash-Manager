-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [FIX] Type Mismatch (42804) in Recruit Ingestion
-- This migration adds explicit casting for the drivers.recruit_status enum
-- and aligns the sync_recruits RPC with the Edge Function payloads.

BEGIN;

-- 1. Fix public.sync_recruits RPC
-- Aligned with ingest-royale-data/stages/discovery.ts payloads
CREATE OR REPLACE FUNCTION public.sync_recruits(p_recruits JSONB)
RETURNS void AS $$
DECLARE
    val JSONB;
BEGIN
    FOR val IN SELECT * FROM jsonb_array_elements(p_recruits)
    LOOP
        INSERT INTO drivers.recruits (
            player_tag, 
            player_name, 
            trophies, 
            donations, 
            cards,
            war_wins, 
            raw_potential_score, 
            source,
            status
        )
        VALUES (
            (val->>'player_tag')::TEXT,
            (val->>'player_name')::TEXT,
            COALESCE((val->>'trophies')::INT, 0),
            COALESCE((val->>'donations')::INT, 0),
            COALESCE((val->>'cards')::INT, 0),
            COALESCE((val->>'war_wins')::INT, 0),
            COALESCE((val->>'raw_potential_score')::NUMERIC, (
                (COALESCE((val->>'trophies')::INT, 0) * 1.0) + 
                (COALESCE((val->>'donations')::INT, 0) * 0.1) + 
                ((COALESCE((val->>'war_wins')::INT, 0) + 500) * 20.0)
            )),
            COALESCE((val->>'source')::TEXT, 'UNKNOWN'),
            COALESCE(val->>'status', 'QUEUE')::drivers.recruit_status
        )
        ON CONFLICT (player_tag) DO UPDATE SET
            player_name = EXCLUDED.player_name,
            trophies = EXCLUDED.trophies,
            donations = EXCLUDED.donations,
            cards = EXCLUDED.cards,
            war_wins = EXCLUDED.war_wins,
            raw_potential_score = GREATEST(drivers.recruits.raw_potential_score, EXCLUDED.raw_potential_score),
            source = EXCLUDED.source,
            status = EXCLUDED.status,
            last_scan = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
