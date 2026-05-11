-- Fix shred_clan_members to deactivate leavers based ONLY on the current payload
-- Rationale: The previous logic checked 2 hours of history, preventing leavers from being deactivated if they appeared in any recent sync.
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
DECLARE
    v_clan_tag TEXT;
BEGIN
    -- Identify the target clan
    v_clan_tag := COALESCE(NEW.clan_tag, (SELECT clan_tag FROM drivers.clans LIMIT 1));

    -- 1. UPSERT participants into universal players registry first to satisfy FKs
    INSERT INTO drivers.players (player_tag, player_name)
    SELECT 
        m->>'tag', 
        m->>'name'
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        updated_at  = now();

    -- 2. UPSERT current members into drivers.members
    INSERT INTO drivers.members (
        player_tag, player_name, role, exp_level, trophies, 
        donations, donations_received, clan_rank, last_seen_at, 
        last_ingested_at, is_active, updated_at, current_clan_tag
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
        now(), 
        TRUE, 
        now(),
        v_clan_tag
    FROM jsonb_array_elements(NEW.payload->'items') m
    WHERE (m->>'tag') != v_clan_tag
    ON CONFLICT (player_tag) DO UPDATE SET
        player_name = EXCLUDED.player_name, 
        role = EXCLUDED.role, 
        exp_level = EXCLUDED.exp_level,
        trophies = EXCLUDED.trophies, 
        donations = EXCLUDED.donations,
        donations_received = EXCLUDED.donations_received, 
        clan_rank = EXCLUDED.clan_rank,
        last_seen_at = EXCLUDED.last_seen_at, 
        last_ingested_at = EXCLUDED.last_ingested_at,
        is_active = TRUE,
        current_clan_tag = EXCLUDED.current_clan_tag,
        updated_at = now();

    -- 3. DEACTIVATE LEAVERS
    -- Rationale: Anyone marked active in this clan who is NOT in the current payload must have left.
    UPDATE drivers.members
    SET is_active = FALSE, updated_at = now()
    WHERE is_active = TRUE
      AND current_clan_tag = v_clan_tag
      AND player_tag NOT IN (
          SELECT (elem->>'tag')::TEXT
          FROM jsonb_array_elements(NEW.payload->'items') AS elem
      );

    RETURN NEW;
END; $function$;
