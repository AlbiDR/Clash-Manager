-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Fix substrate.shred_clan_members trigger:
--   1. Add last_ingested_at = now() to the ON CONFLICT DO UPDATE clause.
--      This was the root cause of all members appearing stale despite the
--      pipeline running successfully every ~15 minutes.
--   2. Map available payload fields (donations, donationsReceived, clanRank)
--      that were present in the raw API response but not being shredded.

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Upsert into base registry first
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT m->>'tag', m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- Upsert into members with full field mapping from the clan member payload.
    -- last_ingested_at = now() is the critical fix: previously this was never
    -- updated on conflict, causing all records to appear permanently stale.
    INSERT INTO drivers.members (
        player_tag,
        player_name,
        role,
        exp_level,
        trophies,
        donations,
        donations_received,
        clan_rank,
        last_seen_at,
        last_ingested_at
    )
    SELECT
        m->>'tag',
        m->>'name',
        m->>'role',
        (m->>'expLevel')::INT,
        (m->>'trophies')::INT,
        COALESCE((m->>'donations')::INT, 0),
        COALESCE((m->>'donationsReceived')::INT, 0),
        (m->>'clanRank')::INT,
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE,
        now()
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name        = EXCLUDED.player_name,
        role               = EXCLUDED.role,
        exp_level          = EXCLUDED.exp_level,
        trophies           = EXCLUDED.trophies,
        donations          = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received,
        clan_rank          = EXCLUDED.clan_rank,
        last_seen_at       = EXCLUDED.last_seen_at,
        last_ingested_at   = now(),
        updated_at         = now();

    RETURN NEW;
END;
$function$;
