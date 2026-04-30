-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
SUPABASE SCHEMA DOCUMENTATION PASS
----------------------------------------------------------------------------
This migration applies PostgreSQL COMMENT ON statements to the entire 
Clash-Manager database stack. It serves as the primary internal manual 
for both developers and automated agents, providing context directly 
at the schema level.
============================================================================
*/

-- -------------------------------------------------------------------------
-- SCHEMA: substrate (Layer 0: Substrate)
-- -------------------------------------------------------------------------

COMMENT ON SCHEMA substrate IS 'L0: Substrate - Ingestion buffers, telemetry, and raw data persistence.';

-- Tables
COMMENT ON TABLE substrate.raw_clan_members IS 'Raw JSON buffer for clan member lists. Shredded into drivers.members.';
COMMENT ON TABLE substrate.raw_clan_profile IS 'Raw JSON buffer for general clan statistics. Shredded into drivers.clans.';
COMMENT ON TABLE substrate.raw_river_race IS 'Raw JSON buffer for current war race data. Shredded into drivers.war_activity.';
COMMENT ON TABLE substrate.raw_war_log IS 'Raw JSON buffer for historical war results. Shredded into drivers.war_history.';
COMMENT ON TABLE substrate.raw_scout_logs IS 'Raw JSON buffer for external player discovery. Shredded into drivers.recruits.';
COMMENT ON TABLE substrate.discovery_cache IS 'Prevents redundant API scans by tracking previously indexed tournament tags.';
COMMENT ON TABLE substrate.governance_telemetry IS 'Central logs for tracking Edge Function heartbeats, durations, and pipeline errors.';
COMMENT ON TABLE substrate.config IS 'Key-value store for global system toggles, worker settings, and manual overrides.';

-- Shredder Functions
COMMENT ON FUNCTION substrate.shred_clan_members() IS 'Transforms raw JSON from substrate.raw_clan_members into relational drivers.members records.';
COMMENT ON FUNCTION substrate.shred_clan_profile() IS 'Transforms raw JSON from substrate.raw_clan_profile into relational drivers.clans records.';
COMMENT ON FUNCTION substrate.shred_river_race() IS 'Transforms raw JSON from substrate.raw_river_race into relational drivers.war_activity records.';
COMMENT ON FUNCTION substrate.shred_war_log() IS 'Transforms raw JSON from substrate.raw_war_log into relational drivers.war_history records.';
COMMENT ON FUNCTION substrate.shred_scout_logs() IS 'Transforms raw JSON from substrate.raw_scout_logs into relational drivers.recruits records, including trophy floor enforcement.';

-- -------------------------------------------------------------------------
-- SCHEMA: drivers (Layer 1: Core / Layer 2: Shared)
-- -------------------------------------------------------------------------

COMMENT ON SCHEMA drivers IS 'L2: Drivers - Relational single source of truth (SSOT) and domain drivers.';

-- Clans
COMMENT ON TABLE drivers.clans IS 'Authoritative registry of tracked clans and their operational requirements (trophies, etc.).';
COMMENT ON COLUMN drivers.clans.required_trophies IS 'The in-game trophy floor. Used by substrate.shred_scout_logs to bench underqualified leads.';

-- Members & snapshots
COMMENT ON TABLE drivers.members IS 'The live consolidated roster of all members across all tracked clans.';
COMMENT ON TABLE drivers.member_snapshots IS 'Daily time-series telemetry for every member, powering growth analysis and trend tracking.';

-- War Persistence
COMMENT ON TABLE drivers.war_activity IS 'The transient, high-resolution record of combat participation for the current active war season.';
COMMENT ON TABLE drivers.war_history IS 'The permanent historical ledger of war results, used for long-term clinical performance scoring.';

-- Headhunter / Recruits
COMMENT ON TABLE drivers.recruits IS 'The active recruitment queue. Leads move from discovery to active scouting here.';
COMMENT ON COLUMN drivers.recruits.status IS 'Status lifecycle: ACTIVE (Qualified), BENCHED (Too low trophies/Invalid), INVITED (Official invite sent).';
COMMENT ON COLUMN drivers.recruits.raw_potential_score IS 'The primitive mathematical merit calculated by the scoring kernel before normalization.';
COMMENT ON COLUMN drivers.recruits.trophies IS 'Current trophy count. Recruits are automatically benched if this falls below the clan requirement.';

COMMENT ON TABLE drivers.recruit_blacklist IS 'Explicit exclusion list. Tags here are stripped out at the Edge to save Royale API calls.';
COMMENT ON TABLE drivers.recruit_ledger IS 'Narrative event bus tracking the lifecycle of a recruit (Found -> Scored -> Benched -> Joined).';
COMMENT ON TABLE drivers.heritage_ledger IS 'Repository for veteran data. Tracks legacy performance to grant positive "Heritage Blessing" scoring modifiers.';

-- Maintenance Functions
COMMENT ON FUNCTION drivers.bench_underqualified_recruits() IS 'Clinical maintenance sweep that benches any pool member who no longer meets the clans trophy requirements.';
COMMENT ON FUNCTION drivers.purge_clanned_recruits() IS 'Autonomous janitor that deletes/archives recruits who have successfully joined a tracked clan.';
COMMENT ON FUNCTION drivers.log_recruit_event() IS 'Standardized narrative logger for the recruitment pipeline.';

-- -------------------------------------------------------------------------
-- SCHEMA: features (Layer 3: Features)
-- -------------------------------------------------------------------------

COMMENT ON SCHEMA features IS 'L3: Features - Presentation views and synthesized business logic layers.';

-- Views
COMMENT ON VIEW features.headhunter_view IS 'Synthesized recruitment workspace. Combines raw scores, heritage, and status for the UI.';
COMMENT ON VIEW features.roster_view IS 'Authoritative roster presentation combining live tags with member status and clan metadata.';
COMMENT ON VIEW features.scoring_view IS 'The primary performance dashboard. Exposes clinical scoring metrics (POS/RPOS/Z-Score).';
COMMENT ON VIEW features.war_activity_view IS 'Real-time war command center exposing current participation and missed attacks.';

-- -------------------------------------------------------------------------
-- SCHEMA: public (Layer 5: Control)
-- -------------------------------------------------------------------------

COMMENT ON FUNCTION public.get_headhunter_context() IS 'High-performance RPC for Edge Functions. Combines trophy floors and exclusion lists into one call.';
COMMENT ON FUNCTION public.ingest_player_battles(text, jsonb) IS 'Central ingestion point for deep-level battle profiling during shadow discovery.';
COMMENT ON FUNCTION public.get_shadow_discovery_targets(int) IS 'Retrieves high-potential battle leads from the player_battles ledger for the scanner to profile.';
