-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/**
 * Migration: Player Registry Unification
 * Resolves FK 23503 (fk_player_battles_player) by introducing a shared base registry.
 * This ensures that players fetched during any stage (members or recruits) are
 * registered as authoritative entities before battle ingestion.
 */

BEGIN;

-- 1. Create the shared base table
CREATE TABLE IF NOT EXISTS drivers.players (
    player_tag TEXT PRIMARY KEY CHECK (player_tag ~* '^#[0289CGJLPQRUVY]+$'),
    player_name TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE drivers.players IS 'L2 Drivers: The authoritative universal registry of all players encountered by the system.';

-- 2. Populate from existing sources
INSERT INTO drivers.players (player_tag, player_name)
SELECT player_tag, player_name FROM drivers.members
ON CONFLICT (player_tag) DO UPDATE SET player_name = EXCLUDED.player_name;

INSERT INTO drivers.players (player_tag, player_name)
SELECT player_tag, player_name FROM drivers.recruits
ON CONFLICT (player_tag) DO UPDATE SET player_name = EXCLUDED.player_name;

INSERT INTO drivers.players (player_tag, player_name)
SELECT player_tag, player_name FROM drivers.heritage_ledger
ON CONFLICT (player_tag) DO UPDATE SET player_name = EXCLUDED.player_name;

-- 3. Transition Foreign Keys
-- 3.1 player_battles: Point to universal registry
ALTER TABLE drivers.player_battles DROP CONSTRAINT IF EXISTS fk_player_battles_player;
ALTER TABLE drivers.player_battles ADD CONSTRAINT fk_player_battles_player 
    FOREIGN KEY (player_tag) REFERENCES drivers.players(player_tag) ON DELETE CASCADE;

-- 3.2 members: Align with base registry
-- Note: We don't drop existing unique index on player_tag as it's the logical PK for members too.
ALTER TABLE drivers.members DROP CONSTRAINT IF EXISTS fk_members_player;
ALTER TABLE drivers.members ADD CONSTRAINT fk_members_player 
    FOREIGN KEY (player_tag) REFERENCES drivers.players(player_tag) ON DELETE CASCADE;

-- 3.3 recruits: Align with base registry
ALTER TABLE drivers.recruits DROP CONSTRAINT IF EXISTS fk_recruits_player;
ALTER TABLE drivers.recruits ADD CONSTRAINT fk_recruits_player 
    FOREIGN KEY (player_tag) REFERENCES drivers.players(player_tag) ON DELETE CASCADE;

-- 4. Update Functions to maintain the registry

-- 4.1 Update shred_clan_members: Register members in base table
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
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
        (m->>'lastSeenAt')::TIMESTAMP WITH TIME ZONE, NEW.clan_tag
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
$$ LANGUAGE plpgsql;

-- 4.2 Update shred_scout_logs: Register recruits in base table
CREATE OR REPLACE FUNCTION substrate.shred_scout_logs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'substrate', 'drivers', 'public'
AS $function$
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

    -- Extract items from payload
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
            
            -- Upsert into base registry
            INSERT INTO drivers.players (player_tag, player_name)
            VALUES (v_recruit.tag, v_recruit.name)
            ON CONFLICT (player_tag) DO UPDATE SET player_name = EXCLUDED.player_name, updated_at = now();

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
$function$;

-- 4.3 Update ingest_player_battles: Defensive registration
CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag TEXT, p_payload JSONB)
RETURNS void AS $$
DECLARE
    v_battle RECORD;
    v_player_name TEXT;
BEGIN
    -- Defensive player registration
    -- Ensure the player exists in drivers.players before battle insertion to satisfy FK.
    SELECT player_name INTO v_player_name FROM (
        SELECT player_name FROM drivers.members WHERE player_tag = p_tag
        UNION
        SELECT player_name FROM drivers.recruits WHERE player_tag = p_tag
    ) x LIMIT 1;

    INSERT INTO drivers.players (player_tag, player_name)
    VALUES (p_tag, COALESCE(v_player_name, 'Unknown Player'))
    ON CONFLICT (player_tag) DO NOTHING;

    FOR v_battle IN 
        SELECT 
            to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"') as battle_time,
            t.type as battle_type,
            t.opponent_player_tag,
            t.opponent_player_name,
            t.team_crowns,
            t.opponent_crowns,
            CASE 
                WHEN t.team_crowns > t.opponent_crowns THEN 'win'
                WHEN t.team_crowns < t.opponent_crowns THEN 'loss'
                ELSE 'draw'
            END as result,
            (t.team_crowns > t.opponent_crowns) as win_status
        FROM (
            SELECT 
                item->>'battleTime' as bt,
                item->>'type' as type,
                item->'team'->0->>'tag' as team_tag,
                COALESCE((item->'team'->0->>'crowns')::INT, 0) as team_crowns,
                item->'opponent'->0->>'tag' as opponent_player_tag,
                item->'opponent'->0->>'name' as opponent_player_name,
                COALESCE((item->'opponent'->0->>'crowns')::INT, 0) as opponent_crowns
            FROM jsonb_array_elements(p_payload) item
            WHERE item->>'battleTime' IS NOT NULL
              AND item->'opponent' IS NOT NULL
        ) t
    LOOP
        INSERT INTO drivers.player_battles (
            player_tag, 
            battle_time, 
            battle_type, 
            win_status, 
            result, 
            team_crowns, 
            opponent_crowns, 
            opponent_player_tag, 
            opponent_player_name
        )
        VALUES (
            p_tag, 
            v_battle.battle_time, 
            v_battle.battle_type, 
            v_battle.win_status, 
            v_battle.result, 
            v_battle.team_crowns, 
            v_battle.opponent_crowns, 
            v_battle.opponent_player_tag, 
            v_battle.opponent_player_name
        )
        ON CONFLICT (player_tag, battle_time) DO NOTHING;
    END LOOP;

    DELETE FROM drivers.player_battles
    WHERE id IN (
        SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY player_tag ORDER BY battle_time DESC) as rn
            FROM drivers.player_battles
            WHERE player_tag = p_tag
        ) x WHERE x.rn > 100
    );
END;
$$ LANGUAGE plpgsql;

COMMIT;
