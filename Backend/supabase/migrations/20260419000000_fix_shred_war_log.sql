-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Fix shred_war_log to align with the drivers.war_history table schema

CREATE OR REPLACE FUNCTION substrate.shred_war_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
BEGIN
    INSERT INTO drivers.war_history (tag, name, week_id, fame, rank, clan_points)
    SELECT 
        (standing->'clan'->>'tag')::TEXT,
        (standing->'clan'->>'name')::TEXT,
        (item->>'seasonId')::TEXT || '-' || (item->>'sectionIndex')::TEXT,
        (standing->'clan'->>'fame')::INTEGER,
        (standing->>'rank')::INTEGER,
        (standing->'clan'->>'clanScore')::INTEGER
    FROM jsonb_array_elements(NEW.payload->'items') item,
         jsonb_array_elements(item->'standings') standing
    WHERE standing->'clan'->>'tag' IS NOT NULL
    ON CONFLICT (tag, week_id) DO UPDATE SET
        name = EXCLUDED.name,
        fame = EXCLUDED.fame,
        rank = EXCLUDED.rank,
        clan_points = EXCLUDED.clan_points,
        updated_at = NOW();

    RETURN NEW;
END;
$function$;
