-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Fix missing clan_tag columns in substrate tables to support the new RPC bridge
-- This ensures consistency across all raw ingestion buffers.

ALTER TABLE substrate.raw_clan_profile 
ADD COLUMN IF NOT EXISTS clan_tag TEXT;

ALTER TABLE substrate.raw_river_race 
ADD COLUMN IF NOT EXISTS clan_tag TEXT;

ALTER TABLE substrate.raw_war_log 
ADD COLUMN IF NOT EXISTS clan_tag TEXT;

-- Add check constraints to ensure valid tags if they are provided
ALTER TABLE substrate.raw_clan_profile DROP CONSTRAINT IF EXISTS check_clan_tag_format;
ALTER TABLE substrate.raw_clan_profile 
ADD CONSTRAINT check_clan_tag_format CHECK (clan_tag ~ '^#[0289CGJLPQRUVY]+$');

ALTER TABLE substrate.raw_river_race DROP CONSTRAINT IF EXISTS check_clan_tag_format;
ALTER TABLE substrate.raw_river_race 
ADD CONSTRAINT check_clan_tag_format CHECK (clan_tag ~ '^#[0289CGJLPQRUVY]+$');

ALTER TABLE substrate.raw_war_log DROP CONSTRAINT IF EXISTS check_clan_tag_format;
ALTER TABLE substrate.raw_war_log 
ADD CONSTRAINT check_clan_tag_format CHECK (clan_tag ~ '^#[0289CGJLPQRUVY]+$');

-- Add comments for documentation
COMMENT ON COLUMN substrate.raw_clan_profile.clan_tag IS 'The official Supercell tag of the clan being ingested.';
COMMENT ON COLUMN substrate.raw_river_race.clan_tag IS 'The official Supercell tag of the clan being ingested.';
COMMENT ON COLUMN substrate.raw_war_log.clan_tag IS 'The official Supercell tag of the clan being ingested.';
