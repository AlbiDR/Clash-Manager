-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Fix shred_clan_members to correctly extract lastSeen instead of lastSeenAt

CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Upsert into base registry first
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT m->>'tag', m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET player_name = EXCLUDED.player_name, updated_at = now();

    -- Upsert into members
    INSERT INTO drivers.members (player_tag, player_name, role, exp_level, trophies, last_seen_at, current_clan_tag)
    SELECT 
        m->>'tag', m->>'name', m->>'role', (m->>'expLevel')::INT, (m->>'trophies')::INT, 
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE, NEW.clan_tag
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        role = EXCLUDED.role,
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies,
        last_seen_at = EXCLUDED.last_seen_at,
        current_clan_tag = EXCLUDED.current_clan_tag,
        updated_at = now();
    RETURN NEW;
END;
$function$;
