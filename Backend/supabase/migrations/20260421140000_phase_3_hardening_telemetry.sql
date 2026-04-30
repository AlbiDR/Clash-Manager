-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Phase 3: Infrastructure Hardening, Telemetry Extension & Docstring Audit

-- ==========================================
-- 1. TELEMETRY EXTENSION (Function 2 Support)
-- ==========================================

ALTER TABLE substrate.pipeline_heartbeat 
ADD COLUMN IF NOT EXISTS last_validation_report jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_data_perfect boolean DEFAULT false;

COMMENT ON COLUMN substrate.pipeline_heartbeat.last_validation_report IS 'Granular checklist of the last run (e.g., stage_called, stage_run, data_integrity_score).';
COMMENT ON COLUMN substrate.pipeline_heartbeat.is_data_perfect IS 'Boolean flag indicating the last run was 100% verified against expected data shapes.';

-- ==========================================
-- 2. GLOBAL RLS HARDENING (PWA ACCESS)
-- ==========================================

-- Drivers: War Activity
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'war_activity' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.war_activity FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'war_activity' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.war_activity FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Drivers: War Opponents
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'war_opponents' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.war_opponents FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'war_opponents' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.war_opponents FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Drivers: Player Battles
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_battles' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.player_battles FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'player_battles' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.player_battles FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Drivers: Member Snapshots
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_snapshots' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.member_snapshots FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'member_snapshots' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.member_snapshots FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Drivers: Heritage Ledger
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heritage_ledger' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.heritage_ledger FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'heritage_ledger' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.heritage_ledger FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Drivers: Recruit Ledger
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recruit_ledger' AND policyname = 'Authenticated Read Access') THEN
        CREATE POLICY "Authenticated Read Access" ON drivers.recruit_ledger FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'recruit_ledger' AND policyname = 'Service Role Full Access') THEN
        CREATE POLICY "Service Role Full Access" ON drivers.recruit_ledger FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- Substrate: Discovery Cache
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'discovery_cache' AND policyname = 'Service Role Only') THEN
        CREATE POLICY "Service Role Only" ON substrate.discovery_cache FOR ALL TO service_role USING (true);
    END IF;
END $$;

-- ==========================================
-- 3. PERFORMANCE TUNING (TEMPORAL INDICES)
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_war_activity_week_id ON drivers.war_activity (week_id);
CREATE INDEX IF NOT EXISTS idx_war_history_week_id ON drivers.war_history (week_id);
CREATE INDEX IF NOT EXISTS idx_player_battles_battle_time ON drivers.player_battles (battle_time DESC);

-- ==========================================
-- 4. NOMENCLATURE & DOCSTRING AUDIT
-- ==========================================

COMMENT ON TABLE drivers.war_activity IS 'Transient record of combat participation for the current active war season. Shredded from substrate.raw_river_race.';
COMMENT ON TABLE drivers.war_history IS 'Permanent historical ledger of war results. Shredded from substrate.raw_war_log.';
COMMENT ON TABLE drivers.player_battles IS 'High-resolution battle ledger. Tracks war participation effort. Shredded from Royale API directly.';

COMMENT ON COLUMN drivers.war_activity.week_id IS 'Unique identifier for the war week (e.g., 2026-W15).';
COMMENT ON COLUMN drivers.war_history.week_id IS 'Unique identifier for the historical war week.';
COMMENT ON COLUMN drivers.player_battles.battle_time IS 'UTC timestamp of the battle completion.';
COMMENT ON COLUMN drivers.player_battles.fame_earned IS 'Points contributed to the river race during this battle.';

COMMENT ON COLUMN substrate.discovery_cache.scanned_at IS 'Timestamp of the last time this player was indexed in a discovery scan.';
COMMENT ON COLUMN substrate.governance_telemetry.discovery_yield IS 'Number of new unique recruits discovered in this cycle.';
COMMENT ON COLUMN substrate.governance_telemetry.discovery_duplicates IS 'Number of previously known recruits found in this cycle.';
