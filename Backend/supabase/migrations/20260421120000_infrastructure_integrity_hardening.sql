-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- [POLISH] Infrastructure & Integrity Hardening
-- This migration implements:
-- 1. Trigger Consolidation (Removing Ghost Triggers)
-- 2. Audit Column Standardization (Adding updated_at)
-- 3. Domain Integrity (Strict Foreign Keys)
-- 4. Type Standardization (ENUMs)

BEGIN;

-- 0. PRE-REQUISITE: Drop dependent views for type changes
-- features.governance_report depends on substrate.pipeline_heartbeat.status
DROP VIEW IF EXISTS features.governance_report CASCADE;

-- 0.1. Drop legacy CHECK constraints that block ENUM conversion
ALTER TABLE substrate.pipeline_heartbeat DROP CONSTRAINT IF EXISTS pipeline_heartbeat_status_check;
ALTER TABLE drivers.recruit_ledger DROP CONSTRAINT IF EXISTS recruit_ledger_event_type_check;

-- 1. TYPE STANDARDIZATION: Transition from CHECK constraints to ENUMs

-- 1.1. Pipeline Status Enum
DO $$ BEGIN
    CREATE TYPE substrate.pipeline_status AS ENUM ('IDLE', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1.2. Recruitment Event Enum
DO $$ BEGIN
    CREATE TYPE drivers.recruit_event_type AS ENUM (
        'DISCOVERED', 'SCORE_THRESHOLD_HIT', 'ACTION_INVITED', 
        'ACTION_DISCARDED', 'JOINED_US', 'PROMOTED', 
        'BENCHED', 'ROTATED_OUT', 'ARCHIVED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update columns to use ENUMs
-- substrate.pipeline_heartbeat
ALTER TABLE substrate.pipeline_heartbeat 
    ALTER COLUMN status TYPE substrate.pipeline_status USING status::substrate.pipeline_status;

-- drivers.recruit_ledger
ALTER TABLE drivers.recruit_ledger 
    ALTER COLUMN event_type TYPE drivers.recruit_event_type USING event_type::drivers.recruit_event_type;

-- 2. AUDIT COLUMN STANDARDIZATION: Adding updated_at to lacking tables

ALTER TABLE drivers.recruits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE drivers.heritage_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE drivers.recruit_blacklist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE substrate.governance_telemetry ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE drivers.player_battles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Setup moddatetime triggers for these tables
CREATE TRIGGER handle_updated_at_recruits BEFORE UPDATE ON drivers.recruits FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
CREATE TRIGGER handle_updated_at_heritage BEFORE UPDATE ON drivers.heritage_ledger FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
CREATE TRIGGER handle_updated_at_blacklist BEFORE UPDATE ON drivers.recruit_blacklist FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
CREATE TRIGGER handle_updated_at_telemetry BEFORE UPDATE ON substrate.governance_telemetry FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');
CREATE TRIGGER handle_updated_at_battles BEFORE UPDATE ON drivers.player_battles FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- 3. TRIGGER CONSOLIDATION: Remove redundant/ghost triggers

-- substrate.raw_clan_profile
DROP TRIGGER IF EXISTS on_substrate_ingested ON substrate.raw_clan_profile;
DROP TRIGGER IF EXISTS on_clan_profile_ingested ON substrate.raw_clan_profile;
CREATE TRIGGER trg_shredder_profile 
    AFTER INSERT ON substrate.raw_clan_profile 
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_clan_profile();

-- substrate.raw_clan_members
DROP TRIGGER IF EXISTS tr_shred_clan_members ON substrate.raw_clan_members;
CREATE TRIGGER trg_shredder_members 
    AFTER INSERT ON substrate.raw_clan_members 
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_clan_members();

-- substrate.raw_river_race
DROP TRIGGER IF EXISTS trg_shred_river_race ON substrate.raw_river_race;
DROP TRIGGER IF EXISTS tr_shred_river_race ON substrate.raw_river_race;
DROP TRIGGER IF EXISTS trigger_shred_river_race ON substrate.raw_river_race;
CREATE TRIGGER trg_shredder_river_race 
    AFTER INSERT ON substrate.raw_river_race 
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_river_race();

-- substrate.raw_war_log
DROP TRIGGER IF EXISTS trg_shred_war_log ON substrate.raw_war_log;
DROP TRIGGER IF EXISTS tr_shred_war_log ON substrate.raw_war_log;
CREATE TRIGGER trg_shredder_war_log 
    AFTER INSERT ON substrate.raw_war_log 
    FOR EACH ROW EXECUTE FUNCTION substrate.shred_war_log();

-- drivers.recruit_buffer
DROP TRIGGER IF EXISTS trg_sentinel_recruit_event ON drivers.recruit_buffer;
DROP TRIGGER IF EXISTS tr_handle_recruit_buffer ON drivers.recruit_buffer;
CREATE TRIGGER trg_sentinel_buffer 
    AFTER INSERT ON drivers.recruit_buffer 
    FOR EACH ROW EXECUTE FUNCTION drivers.handle_recruit_buffer();

-- 4. DOMAIN INTEGRITY: Strict Foreign Keys

-- Ensure target columns are unique for FK references
ALTER TABLE drivers.clans DROP CONSTRAINT IF EXISTS clans_clan_tag_unique;
ALTER TABLE drivers.clans ADD CONSTRAINT clans_clan_tag_unique UNIQUE (clan_tag);

-- Link Members to Clans
ALTER TABLE drivers.members 
    DROP CONSTRAINT IF EXISTS fk_members_current_clan;
ALTER TABLE drivers.members 
    ADD CONSTRAINT fk_members_current_clan 
    FOREIGN KEY (current_clan_tag) 
    REFERENCES drivers.clans(clan_tag) 
    ON DELETE SET NULL;

-- Link War Activity to Members
ALTER TABLE drivers.war_activity 
    DROP CONSTRAINT IF EXISTS fk_war_activity_player;
ALTER TABLE drivers.war_activity 
    ADD CONSTRAINT fk_war_activity_player 
    FOREIGN KEY (player_tag) 
    REFERENCES drivers.members(player_tag) 
    ON DELETE CASCADE;

-- Link War History to Members
ALTER TABLE drivers.war_history 
    DROP CONSTRAINT IF EXISTS fk_war_history_player;
ALTER TABLE drivers.war_history 
    ADD CONSTRAINT fk_war_history_player 
    FOREIGN KEY (player_tag) 
    REFERENCES drivers.members(player_tag) 
    ON DELETE CASCADE;

-- Link Player Battles to Members
ALTER TABLE drivers.player_battles 
    DROP CONSTRAINT IF EXISTS fk_player_battles_player;
ALTER TABLE drivers.player_battles 
    ADD CONSTRAINT fk_player_battles_player 
    FOREIGN KEY (player_tag) 
    REFERENCES drivers.members(player_tag) 
    ON DELETE CASCADE;

-- 5. LEAN PRUNING: Implement centralized purge logic if not exists
-- (Assuming maintenance_plan items were partially implemented, we refresh them)

DROP FUNCTION IF EXISTS substrate.purge_raw_logs();
CREATE OR REPLACE FUNCTION substrate.purge_raw_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.raw_clan_profile WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_clan_members WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_river_race WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_war_log WHERE ingested_at < (now() - interval '24 hours');
    DELETE FROM substrate.raw_scout_logs WHERE ingested_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS substrate.purge_governance_telemetry();
CREATE OR REPLACE FUNCTION substrate.purge_governance_telemetry()
RETURNS void AS $$
BEGIN
    DELETE FROM substrate.governance_telemetry WHERE created_at < (now() - interval '30 days');
END;
$$ LANGUAGE plpgsql;

-- 6. VIEW RESTORATION: Rebuild dropped views
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
