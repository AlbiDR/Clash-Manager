-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Remove current_clan_tag from drivers.members and update dependent views/triggers

-- 1. Drop features.roster_view so we can drop the column
DROP VIEW IF EXISTS features.roster_view CASCADE;

-- 2. Drop the current_clan_tag column from drivers.members
ALTER TABLE drivers.members DROP COLUMN IF EXISTS current_clan_tag CASCADE;

-- 3. Recreate features.roster_view without current_clan_tag
CREATE OR REPLACE VIEW features.roster_view AS
 SELECT m.player_tag,
    m.player_name,
    m.role,
    ('https://link.clashroyale.com/en?player='::text || ltrim(m.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(m.player_tag, '#'::text)) AS royaleapi_link,
    m.exp_level,
    m.trophies,
    m.donations,
    m.decks_used_today,
    m.decks_used_weekly,
    m.week_fame,
    s.raw_performance_score,
    s.performance_score,
    s.stability_index,
    m.last_seen_at,
    substrate.format_last_seen(s.days_inactive) AS last_seen_label,
    substrate.format_tenure(s.tenure_days) AS tenure_label
   FROM (drivers.members m
     LEFT JOIN features.scoring_view s ON ((m.player_tag = s.player_tag)))
  WHERE ((m.is_active = true) AND (m.player_tag ~ '^#[0289CGJLPQRUVY]+$'::text))
  ORDER BY s.raw_performance_score DESC, s.performance_score DESC;

-- Grant permissions for roster_view
GRANT SELECT ON features.roster_view TO authenticated, anon, service_role;

-- 4. Update the shredder function to stop inserting current_clan_tag
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

    -- Upsert into members (removed current_clan_tag)
    INSERT INTO drivers.members (player_tag, player_name, role, exp_level, trophies, last_seen_at)
    SELECT 
        m->>'tag', m->>'name', m->>'role', (m->>'expLevel')::INT, (m->>'trophies')::INT, 
        (m->>'lastSeen')::TIMESTAMP WITH TIME ZONE
    FROM jsonb_array_elements(NEW.payload->'items') m
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        role = EXCLUDED.role,
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = now();
    RETURN NEW;
END;
$function$;
