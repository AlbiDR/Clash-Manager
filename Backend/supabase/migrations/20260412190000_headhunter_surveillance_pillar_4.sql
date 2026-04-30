-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Pillar 4: Surveillance (Shadow Scouting)
-- Hardening of the recruitment sensor range via battle log shadows.

-- 1. Schema Refactor: Opponent Metadata
ALTER TABLE drivers.player_battles 
ADD COLUMN IF NOT EXISTS opponent_tag TEXT,
ADD COLUMN IF NOT EXISTS opponent_name TEXT,
ADD COLUMN IF NOT EXISTS team_crowns INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS opponent_crowns INTEGER DEFAULT 0;

-- 2. Ingestion Logic Update: Opponent Extraction
CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag TEXT, p_payload JSONB)
RETURNS void AS $$
DECLARE
    v_battle RECORD;
BEGIN
    -- 1. Extraction Loop
    FOR v_battle IN 
        SELECT 
            to_timestamp(t.bt, 'YYYYMMDD"T"HH24MISS.MS"Z"') as battle_time,
            t.type as battle_type,
            t.team_tag,
            t.team_name,
            t.team_crowns,
            t.opponent_tag,
            t.opponent_name,
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
                item->'team'->0->>'name' as team_name,
                COALESCE((item->'team'->0->>'crowns')::INT, 0) as team_crowns,
                item->'opponent'->0->>'tag' as opponent_tag,
                item->'opponent'->0->>'name' as opponent_name,
                COALESCE((item->'opponent'->0->>'crowns')::INT, 0) as opponent_crowns
            FROM jsonb_array_elements(p_payload) item
            WHERE item->>'battleTime' IS NOT NULL
              AND item->'opponent' IS NOT NULL
        ) t
    LOOP
        -- 2. Transactional Upsert
        INSERT INTO drivers.player_battles (
            player_tag, 
            battle_time, 
            battle_type, 
            win_status, 
            result, 
            team_crowns, 
            opponent_crowns, 
            opponent_tag, 
            opponent_name
        )
        VALUES (
            p_tag, 
            v_battle.battle_time, 
            v_battle.battle_type, 
            v_battle.win_status, 
            v_battle.result, 
            v_battle.team_crowns, 
            v_battle.opponent_crowns, 
            v_battle.opponent_tag, 
            v_battle.opponent_name
        )
        ON CONFLICT (player_tag, battle_time) DO NOTHING;
    END LOOP;

    -- 3. Automatic Archival (Keep last 100 battles per player for performance)
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

-- 3. Discovery Engine: Shadow Isolation
CREATE OR REPLACE FUNCTION public.get_shadow_discovery_targets(p_limit INT DEFAULT 50)
RETURNS TABLE (opponent_tag TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT pb.opponent_tag
    FROM drivers.player_battles pb
    WHERE pb.battle_time > (now() - interval '24 hours')
      AND pb.opponent_tag IS NOT NULL
      -- THE SHIELD: Exclude residents
      AND NOT EXISTS (SELECT 1 FROM drivers.members m WHERE m.tag = pb.opponent_tag)
      -- THE SHIELD: Exclude existing candidates
      AND NOT EXISTS (SELECT 1 FROM drivers.recruits r WHERE r.tag = pb.opponent_tag)
      -- THE SHIELD: Exclude blacklisted targets
      AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.tag = pb.opponent_tag)
    ORDER BY pb.opponent_tag -- Deterministic ordering for stable batches
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
