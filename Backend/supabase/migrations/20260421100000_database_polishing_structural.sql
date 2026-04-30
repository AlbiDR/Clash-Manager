-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [POLISH] Structural Naming Consistency & Domain Hardening
-- This migration standardizes all 'name' columns to 'player_name' or 'clan_name'
-- and ensures all tag columns have authoritative regex constraints.

BEGIN;

-- 1. RENAMING: Standardize naming to follow Domain_Role pattern

-- 1.1 Player Domain Consistency
ALTER TABLE drivers.members RENAME COLUMN name TO player_name;
ALTER TABLE drivers.war_activity RENAME COLUMN name TO player_name;
ALTER TABLE drivers.war_history RENAME COLUMN name TO player_name;
ALTER TABLE drivers.recruits RENAME COLUMN name TO player_name;
ALTER TABLE drivers.heritage_ledger RENAME COLUMN name TO player_name;
ALTER TABLE drivers.recruit_ledger RENAME COLUMN tag_name TO player_name;
ALTER TABLE drivers.player_battles RENAME COLUMN opponent_name TO opponent_player_name;
ALTER TABLE drivers.player_battles RENAME COLUMN opponent_tag TO opponent_player_tag;

-- 1.2 Clan Domain Consistency
ALTER TABLE drivers.clans RENAME COLUMN name TO clan_name;
ALTER TABLE drivers.war_opponents RENAME COLUMN name TO clan_name;

-- 1.3 Generic Tag Unification (Discovery)
ALTER TABLE substrate.discovery_cache RENAME COLUMN tag TO player_tag;

-- 2. DOMAIN HARDENING: Authoritative Tag Regex Constraints
-- Regex: ^#[0289CGJLPQRUVY]+$ (Official CR Tag charset)

DO $$ 
BEGIN
    -- Add constraints only if they don't exist
    
    -- drivers.war_activity
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_war_activity_player_tag') THEN
        ALTER TABLE drivers.war_activity ADD CONSTRAINT chk_war_activity_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.war_history
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_war_history_player_tag') THEN
        ALTER TABLE drivers.war_history ADD CONSTRAINT chk_war_history_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.player_battles
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_battles_player_tag') THEN
        ALTER TABLE drivers.player_battles ADD CONSTRAINT chk_player_battles_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_player_battles_opponent_player_tag') THEN
        ALTER TABLE drivers.player_battles ADD CONSTRAINT chk_player_battles_opponent_player_tag CHECK (opponent_player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.member_snapshots
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_member_snapshots_player_tag') THEN
        ALTER TABLE drivers.member_snapshots ADD CONSTRAINT chk_member_snapshots_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.recruits (target_clan_tag)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recruits_target_clan_tag') THEN
        ALTER TABLE drivers.recruits ADD CONSTRAINT chk_recruits_target_clan_tag CHECK (target_clan_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.recruit_buffer
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recruit_buffer_player_tag') THEN
        ALTER TABLE drivers.recruit_buffer ADD CONSTRAINT chk_recruit_buffer_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.recruit_blacklist
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recruit_blacklist_player_tag') THEN
        ALTER TABLE drivers.recruit_blacklist ADD CONSTRAINT chk_recruit_blacklist_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.recruit_ledger
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_recruit_ledger_player_tag') THEN
        ALTER TABLE drivers.recruit_ledger ADD CONSTRAINT chk_recruit_ledger_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- drivers.heritage_ledger
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_heritage_ledger_player_tag') THEN
        ALTER TABLE drivers.heritage_ledger ADD CONSTRAINT chk_heritage_ledger_player_tag CHECK (player_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

    -- substrate.raw_clan_members
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_raw_clan_members_clan_tag') THEN
        ALTER TABLE substrate.raw_clan_members ADD CONSTRAINT chk_raw_clan_members_clan_tag CHECK (clan_tag ~ '^#[0289CGJLPQRUVY]+$');
    END IF;

END $$;

-- 3. FUNCTION REFRESH: Update logic to use unified names

-- substrate.shred_clan_members
CREATE OR REPLACE FUNCTION substrate.shred_clan_members()
RETURNS TRIGGER AS $$
BEGIN
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

-- substrate.shred_river_race
CREATE OR REPLACE FUNCTION substrate.shred_river_race()
RETURNS TRIGGER AS $$
DECLARE
    current_season_id TEXT;
    target_week_id TEXT;
BEGIN
    SELECT (payload->'items'->0->>'seasonId')::TEXT INTO current_season_id
    FROM substrate.raw_war_log
    ORDER BY ingested_at DESC LIMIT 1;

    IF current_season_id IS NOT NULL THEN
        target_week_id := current_season_id || '-' || (NEW.payload->'sectionIndex');
    ELSE
        target_week_id := to_char(now(), 'YYYY-"W"WW');
    END IF;

    -- Upsert war_activity
    INSERT INTO drivers.war_activity (
        player_tag, player_name, week_id, section_index,
        decks_used, decks_used_today, fame
    )
    SELECT 
        p->>'tag', p->>'name', target_week_id, (NEW.payload->>'sectionIndex')::INT,
        (p->>'decksUsed')::INT, (p->>'decksUsedToday')::INT, (p->>'fame')::INT
    FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        decks_used = EXCLUDED.decks_used,
        decks_used_today = EXCLUDED.decks_used_today,
        fame = EXCLUDED.fame,
        updated_at = now();

    -- Sync to members
    UPDATE drivers.members m
    SET 
        decks_used_today = p.p_decks_used_today,
        decks_used_weekly = p.p_decks_used,
        week_fame = p.p_fame,
        last_ingested_at = now()
    FROM (
        SELECT 
            p->>'tag' as p_tag,
            (p->>'fame')::INT as p_fame,
            (p->>'decksUsed')::INT as p_decks_used,
            (p->>'decksUsedToday')::INT as p_decks_used_today
        FROM jsonb_array_elements(NEW.payload->'clan'->'participants') p
    ) p
    WHERE m.player_tag = p.p_tag;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- substrate.shred_war_log
CREATE OR REPLACE FUNCTION substrate.shred_war_log()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO drivers.war_history (player_tag, player_name, week_id, fame, rank, clan_points)
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
    ON CONFLICT (player_tag, week_id) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        fame = EXCLUDED.fame,
        rank = EXCLUDED.rank,
        clan_points = EXCLUDED.clan_points,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- public.ingest_player_battles
CREATE OR REPLACE FUNCTION public.ingest_player_battles(p_tag TEXT, p_payload JSONB)
RETURNS void AS $$
DECLARE
    v_battle RECORD;
BEGIN
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

-- drivers.handle_recruit_buffer
CREATE OR REPLACE FUNCTION drivers.handle_recruit_buffer()
RETURNS TRIGGER AS $$
DECLARE
    v_target_recruit RECORD;
    v_ledger_event TEXT;
BEGIN
    DELETE FROM drivers.recruit_blacklist WHERE expires_at < NOW();

    SELECT * INTO v_target_recruit FROM drivers.recruits WHERE player_tag = NEW.player_tag;

    IF NEW.event_type IN ('INVITED', 'DISCARDED') THEN
        v_ledger_event := CASE 
            WHEN NEW.event_type = 'INVITED' THEN 'ACTION_INVITED'
            WHEN NEW.event_type = 'DISCARDED' THEN 'ACTION_DISCARDED'
        END;

        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, new_score, description)
        VALUES (
            NEW.player_tag,
            COALESCE(v_target_recruit.player_name, NEW.metadata->>'name', 'Unknown'),
            v_ledger_event,
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            'Manual user action processed via RAM buffer.'
        );

        INSERT INTO drivers.recruit_blacklist (
            player_tag, 
            player_name, 
            raw_potential_score, 
            snapshot, 
            reason, 
            expires_at
        )
        VALUES (
            NEW.player_tag,
            COALESCE(v_target_recruit.player_name, NEW.metadata->>'name', 'Unknown'),
            COALESCE(v_target_recruit.raw_potential_score, (NEW.metadata->>'raw_potential_score')::numeric, 0.0),
            COALESCE(to_jsonb(v_target_recruit), NEW.metadata),
            NEW.event_type,
            NOW() + INTERVAL '30 days'
        )
        ON CONFLICT (player_tag) DO UPDATE SET
            expires_at = EXCLUDED.expires_at,
            reason = EXCLUDED.reason,
            player_name = COALESCE(EXCLUDED.player_name, recruit_blacklist.player_name),
            raw_potential_score = COALESCE(EXCLUDED.raw_potential_score, recruit_blacklist.raw_potential_score),
            snapshot = EXCLUDED.snapshot;
            
        DELETE FROM drivers.recruits WHERE player_tag = NEW.player_tag;
    END IF;

    DELETE FROM drivers.recruit_buffer WHERE id = NEW.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- drivers.log_recruit_event
CREATE OR REPLACE FUNCTION drivers.log_recruit_event()
RETURNS TRIGGER AS $$
DECLARE
    v_delta NUMERIC;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, new_score, description)
        VALUES (NEW.player_tag, NEW.player_name, 'DISCOVERED', NEW.raw_potential_score, 'Initial discovery via sensory mesh.');
        
        IF (NEW.status = 'ACTIVE') THEN
            INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
            VALUES (NEW.player_tag, NEW.player_name, 'PROMOTED', 'Direct entry into ACTIVE status.');
        END IF;
        RETURN NEW;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
        IF (NEW.status <> OLD.status) THEN
            IF (NEW.status = 'ACTIVE') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'PROMOTED', 'Promoted to ACTIVE rotation.');
            ELSIF (OLD.status = 'ACTIVE' AND NEW.status = 'BENCHED') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'BENCHED', 'Rotated out of ACTIVE status to BENCHED.');
            ELSIF (OLD.status = 'ACTIVE' AND NEW.status = 'QUEUE') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'ROTATED_OUT', 'Moved from ACTIVE back to QUEUE.');
            ELSIF (NEW.status = 'ARCHIVED') THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, description)
                VALUES (NEW.player_tag, NEW.player_name, 'ARCHIVED', 'Recruit archived/retired.');
            END IF;
        END IF;

        IF (NEW.raw_potential_score <> OLD.raw_potential_score) THEN
            v_delta := ABS(NEW.raw_potential_score - OLD.raw_potential_score) / NULLIF(OLD.raw_potential_score, 0);
            IF (v_delta >= 0.05 OR (OLD.raw_potential_score = 0 AND NEW.raw_potential_score > 0)) THEN
                INSERT INTO drivers.recruit_ledger (player_tag, player_name, event_type, old_score, new_score, description)
                VALUES (
                    NEW.player_tag, NEW.player_name, 'SCORE_THRESHOLD_HIT', 
                    OLD.raw_potential_score, NEW.raw_potential_score, 
                    'Significant performance shift detected (' || ROUND(v_delta * 100, 1) || '% change).'
                );
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- substrate.handle_heritage_snapshot
CREATE OR REPLACE FUNCTION substrate.handle_heritage_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') OR (NEW.is_active = FALSE AND OLD.is_active = TRUE) THEN
        INSERT INTO drivers.heritage_ledger (player_tag, player_name, tenure_days, avg_fame, max_pes, last_seen_at)
        VALUES (
            COALESCE(OLD.player_tag, NEW.player_tag),
            COALESCE(OLD.player_name, NEW.player_name),
            EXTRACT(DAY FROM (NOW() - COALESCE(OLD.joined_at, NOW())))::INTEGER,
            COALESCE(OLD.week_fame, 0),
            0,
            NOW()
        )
        ON CONFLICT (player_tag) DO UPDATE
        SET 
            player_name = EXCLUDED.player_name,
            tenure_days = EXCLUDED.tenure_days,
            avg_fame = EXCLUDED.avg_fame,
            max_pes = EXCLUDED.max_pes,
            last_seen_at = NOW();
    END IF;
    
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC UPDATES: Fix broken context and discovery endpoints

-- public.get_headhunter_context
CREATE OR REPLACE FUNCTION public.get_headhunter_context()
RETURNS JSONB AS $$
DECLARE
    v_required_trophies INTEGER;
    v_exclusion_tags TEXT[];
BEGIN
    -- 1. Get Trophy Floor
    SELECT COALESCE(required_trophies, 0)
    INTO v_required_trophies
    FROM drivers.clans
    LIMIT 1;

    -- 2. Aggregate Exclusion List
    SELECT array_agg(DISTINCT player_tag)
    INTO v_exclusion_tags
    FROM (
        SELECT player_tag FROM drivers.recruit_blacklist
        UNION
        SELECT player_tag FROM drivers.members
        UNION
        SELECT player_tag FROM drivers.recruits
    ) exclusions
    WHERE player_tag IS NOT NULL;

    -- 3. Return JSON structure
    RETURN jsonb_build_object(
        'required_trophies', COALESCE(v_required_trophies, 0),
        'exclusion_tags', COALESCE(v_exclusion_tags, ARRAY[]::TEXT[])
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- public.get_shadow_discovery_targets
CREATE OR REPLACE FUNCTION public.get_shadow_discovery_targets(p_limit INT DEFAULT 50)
RETURNS TABLE (opponent_player_tag TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT pb.opponent_player_tag
    FROM drivers.player_battles pb
    WHERE pb.battle_time > (now() - interval '24 hours')
      AND pb.opponent_player_tag IS NOT NULL
      -- THE SHIELD: Exclude residents
      AND NOT EXISTS (SELECT 1 FROM drivers.members m WHERE m.player_tag = pb.opponent_player_tag)
      -- THE SHIELD: Exclude existing candidates
      AND NOT EXISTS (SELECT 1 FROM drivers.recruits r WHERE r.player_tag = pb.opponent_player_tag)
      -- THE SHIELD: Exclude blacklisted targets
      AND NOT EXISTS (SELECT 1 FROM drivers.recruit_blacklist bl WHERE bl.player_tag = pb.opponent_player_tag)
    ORDER BY pb.opponent_player_tag
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5. VIEW REFRESH: Rebuild all feature views with new column names

-- Drop existing views first (cascading)
DROP VIEW IF EXISTS features.roster_view CASCADE;
DROP VIEW IF EXISTS features.headhunter_view CASCADE;
DROP VIEW IF EXISTS features.scoring_view CASCADE;
DROP VIEW IF EXISTS features.war_activity_view CASCADE;
DROP VIEW IF EXISTS features.war_loyalty_view CASCADE;
DROP VIEW IF EXISTS features.tactical_awareness_view CASCADE;
DROP VIEW IF EXISTS features.governance_report CASCADE;

-- features.scoring_view
CREATE OR REPLACE VIEW features.scoring_view AS
 WITH factual_logs AS (
          SELECT player_tag,
            count(DISTINCT week_id) AS recorded_weeks,
            avg(fame) AS avg_fame,
            ((avg(decks_used) / 4.0) * 100.0) AS avg_war_rate
           FROM drivers.war_activity
          GROUP BY player_tag
        ), base_stats AS (
          SELECT m.player_tag,
            m.player_name,
            m.trophies,
            m.donations,
            m.joined_at,
            m.last_seen_at,
            m.war_wins,
            GREATEST((0)::numeric, (EXTRACT(epoch FROM (now() - m.last_seen_at)) / 86400.0)) AS days_inactive,
            GREATEST((0)::numeric, (EXTRACT(epoch FROM (now() - m.joined_at)) / 86400.0)) AS tenure_days,
            COALESCE(m.week_fame, 0) AS current_fame,
            COALESCE(fl.avg_fame, (0)::numeric) AS avg_fame,
            COALESCE(fl.avg_war_rate, (0)::numeric) AS war_rate,
            COALESCE(fl.recorded_weeks, (0)::bigint) AS recorded_weeks
           FROM (drivers.members m
             LEFT JOIN factual_logs fl ON ((m.player_tag = fl.player_tag)))
          WHERE (m.is_active = true)
        ), weighted_calculations AS (
          SELECT base_stats.player_tag,
            base_stats.player_name,
            base_stats.trophies,
            base_stats.donations,
            base_stats.joined_at,
            base_stats.last_seen_at,
            base_stats.war_wins,
            base_stats.days_inactive,
            base_stats.tenure_days,
            base_stats.current_fame,
            base_stats.avg_fame,
            base_stats.war_rate,
            base_stats.recorded_weeks,
            LEAST(1.10, (1.0 + ((base_stats.tenure_days / 30.0) * 0.01))) AS loyalty_multiplier,
            LEAST(1.0, ((base_stats.recorded_weeks)::numeric / 12.0)) AS stability_index,
            round(((((((base_stats.current_fame)::numeric * 3.0) + (base_stats.avg_fame * 15.0)) + ((base_stats.donations)::numeric * 100.0)) + ((base_stats.trophies)::numeric * 0.1)) + (base_stats.war_rate * 150.0))) AS baseline_raw_score,
            ((((base_stats.trophies)::numeric * 1.0) + ((base_stats.donations)::numeric * 0.1)) + (((base_stats.war_wins + 500))::numeric * 20.0)) AS raw_potential_score,
            power((1.0 - 0.08), GREATEST((0)::numeric, (base_stats.days_inactive - 4.0))) AS decay_multiplier
           FROM base_stats
        ), clinical_layer AS (
          SELECT weighted_calculations.player_tag,
            weighted_calculations.player_name,
            weighted_calculations.trophies,
            weighted_calculations.donations,
            weighted_calculations.joined_at,
            weighted_calculations.last_seen_at,
            weighted_calculations.war_wins,
            weighted_calculations.days_inactive,
            weighted_calculations.tenure_days,
            weighted_calculations.current_fame,
            weighted_calculations.avg_fame,
            weighted_calculations.war_rate,
            weighted_calculations.recorded_weeks,
            weighted_calculations.loyalty_multiplier,
            weighted_calculations.stability_index,
            weighted_calculations.baseline_raw_score,
            weighted_calculations.raw_potential_score,
            weighted_calculations.decay_multiplier,
            round(((weighted_calculations.baseline_raw_score * weighted_calculations.loyalty_multiplier) * weighted_calculations.decay_multiplier)) AS raw_performance_score,
                CASE
                    WHEN (weighted_calculations.tenure_days < (14)::numeric) THEN ((weighted_calculations.raw_potential_score * power((((14)::numeric - weighted_calculations.tenure_days) / 14.0), (2)::numeric)) / 5.0)
                    ELSE (0)::numeric
                END AS heritage_bonus
           FROM weighted_calculations
        )
 SELECT player_tag,
    player_name,
    trophies,
    donations,
    joined_at,
    last_seen_at,
    war_wins,
    days_inactive,
    tenure_days,
    current_fame,
    avg_fame,
    war_rate,
    recorded_weeks,
    loyalty_multiplier,
    stability_index,
    baseline_raw_score,
    raw_potential_score,
    decay_multiplier,
    raw_performance_score,
    heritage_bonus,
        CASE
            WHEN (max((raw_performance_score + heritage_bonus)) OVER () > (0)::numeric) THEN round((((raw_performance_score + heritage_bonus) / max((raw_performance_score + heritage_bonus)) OVER ()) * 100.0))
            ELSE (0)::numeric
        END AS performance_score
   FROM clinical_layer;

-- features.roster_view
CREATE OR REPLACE VIEW features.roster_view AS
 SELECT m.player_tag,
    m.player_name,
    m.role,
    m.current_clan_tag,
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

-- features.war_activity_view
CREATE OR REPLACE VIEW features.war_activity_view AS
 SELECT wa.player_tag,
    wa.player_name,
    wa.decks_used AS total_decks,
    wa.decks_used_today AS current_decks,
    wa.fame,
        CASE
            WHEN (wa.decks_used_today >= 4) THEN 'Completed'::text
            WHEN (wa.decks_used_today > 0) THEN 'Partial'::text
            ELSE 'Missing'::text
        END AS status,
    wa.updated_at AS snapshot_at
   FROM (drivers.war_activity wa
     JOIN drivers.members m ON ((wa.player_tag = m.player_tag)))
  WHERE ((m.is_active = true) AND (wa.updated_at > (now() - '24:00:00'::interval)))
  ORDER BY wa.decks_used_today, wa.fame DESC;

-- features.headhunter_view
CREATE OR REPLACE VIEW features.headhunter_view AS
 WITH elite_benchmark AS (
          SELECT COALESCE(avg(sub.score), (12000)::numeric) AS value
            FROM ( SELECT scoring_view.raw_performance_score AS score
                    FROM features.scoring_view
                   ORDER BY scoring_view.raw_performance_score DESC
                  LIMIT 10) sub
        ), heritage_context AS (
          SELECT heritage_ledger.player_tag,
            heritage_ledger.max_pes,
            heritage_ledger.tenure_days,
            (heritage_ledger.last_seen_at >= (now() - '30 days'::interval)) AS is_fresh
           FROM drivers.heritage_ledger
        )
 SELECT r.player_tag,
    r.player_name,
    ('https://link.clashroyale.com/en?player='::text || ltrim(r.player_tag, '#'::text)) AS ingame_link,
    ('https://royaleapi.com/player/'::text || ltrim(r.player_tag, '#'::text)) AS royaleapi_link,
    r.trophies,
    r.donations,
    r.war_wins,
    r.found_date,
    (round((EXTRACT(epoch FROM (now() - r.found_date)) / (60)::numeric)))::integer AS longevity,
    substrate.format_longevity((round((EXTRACT(epoch FROM (now() - r.found_date)) / (60)::numeric)))::integer) AS longevity_label,
    r.raw_potential_score,
    LEAST((100)::numeric, round((((r.raw_potential_score *
        CASE
            WHEN COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) THEN 1.05
            ELSE 1.0
        END) / ( SELECT elite_benchmark.value
           FROM elite_benchmark)) * (100)::numeric))) AS potential_score,
    COALESCE((h.is_fresh AND (h.max_pes > 10000)), false) AS has_heritage_blessing,
        CASE
            WHEN (r.raw_potential_score >= (12000)::numeric) THEN 'ELITE'::text
            WHEN (r.raw_potential_score >= (10500)::numeric) THEN 'HIGH'::text
            ELSE 'MID'::text
        END AS tier,
    r.last_scan AS last_seen_at,
        CASE
            WHEN ((h.player_tag IS NOT NULL) AND h.is_fresh) THEN 'RETURNING_VETERAN'::text
            WHEN (h.player_tag IS NOT NULL) THEN 'FORMER_MEMBER'::text
            ELSE 'NEW_CANDIDATE'::text
        END AS heritage_status
   FROM (drivers.recruits r
     LEFT JOIN heritage_context h ON ((h.player_tag = r.player_tag)))
  WHERE ((r.status = 'ACTIVE'::drivers.recruit_status) AND (NOT (EXISTS ( SELECT 1
           FROM drivers.recruit_blacklist bl
          WHERE (bl.player_tag = r.player_tag)))))
  ORDER BY r.raw_potential_score DESC;

-- features.war_loyalty_view
CREATE OR REPLACE VIEW features.war_loyalty_view AS
 SELECT player_tag,
    player_name,
    count(week_id) AS weeks_tracked,
    sum(fame) AS total_career_fame,
    (round(avg(fame)))::integer AS avg_fame_per_week,
    peak_fame
   FROM (
        SELECT player_tag, player_name, week_id, fame, MAX(fame) OVER(PARTITION BY player_tag) as peak_fame
        FROM drivers.war_history
   ) sub
  GROUP BY player_tag, player_name, peak_fame
  ORDER BY ((round(avg(fame)))::integer) DESC;

-- features.tactical_awareness_view (Rebuild)
CREATE OR REPLACE VIEW features.tactical_awareness_view AS
 SELECT 
    player_tag,
    player_name,
    current_clan_tag,
    trophies,
    week_fame,
    decks_used_today,
    CASE 
        WHEN decks_used_today < 4 AND (now() AT TIME ZONE 'UTC')::TIME > '18:00:00'::TIME THEN 'CRITICAL'
        WHEN decks_used_today < 4 THEN 'PENDING'
        ELSE 'COMPLETE'
    END as war_status
 FROM drivers.members
 WHERE is_active = true;

-- features.governance_report (Rebuild)
CREATE OR REPLACE VIEW features.governance_report AS
 SELECT 
    component_id,
    status,
    last_triggered_at,
    last_success_at,
    last_failure_at,
    last_message,
    discovery_yield
 FROM substrate.pipeline_heartbeat;

COMMIT;
