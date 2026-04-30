-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

/*
============================================================================
PERFORMANCE & SECURITY HARDENING PASS
----------------------------------------------------------------------------
Addresses the following Supabase Advisory Center diagnostics:
  1. [PERF]  Duplicate indexes on drivers.player_battles
  2. [PERF]  Auth RLS initialization plan (per-row auth.role() re-evaluation)
  3. [SEC]   Function search_path mutable (all project functions)
============================================================================
*/

-- =========================================================================
-- 1. DROP DUPLICATE INDEXES (drivers.player_battles)
-- =========================================================================
-- Three indexes exist for the same (player_tag, battle_time) constraint.
-- Keeping: uq_player_battle as the single authoritative unique constraint.
-- Dropping the two redundant duplicates to eliminate 2x write overhead.

-- Constraints must be dropped via ALTER TABLE, not DROP INDEX.
-- IF EXISTS guards ensure idempotency regardless of how they were originally created.
ALTER TABLE drivers.player_battles DROP CONSTRAINT IF EXISTS player_battles_tag_time_unique;
ALTER TABLE drivers.player_battles DROP CONSTRAINT IF EXISTS player_battles_tag_battle_time_key;
-- Fallback: drop as pure indexes if they were not backed by a named constraint.
DROP INDEX IF EXISTS drivers.player_battles_tag_time_unique;
DROP INDEX IF EXISTS drivers.player_battles_tag_battle_time_key;


-- =========================================================================
-- 2. RLS POLICY OPTIMIZATION (Statement-Level Evaluation)
-- =========================================================================
-- Replace per-row auth.role() calls with a subquery so PostgreSQL evaluates
-- the function ONCE per statement, not once per row scanned.

-- --- drivers.recruits ---
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.recruits;
CREATE POLICY "Authenticated Read Access" ON drivers.recruits
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

-- --- drivers.recruit_blacklist ---
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.recruit_blacklist;
CREATE POLICY "Authenticated Read Access" ON drivers.recruit_blacklist
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

-- --- drivers.war_history ---
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.war_history;
CREATE POLICY "Authenticated Read Access" ON drivers.war_history
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

-- --- substrate.governance_telemetry ---
DROP POLICY IF EXISTS "Authenticated Read Access" ON substrate.governance_telemetry;
CREATE POLICY "Authenticated Read Access" ON substrate.governance_telemetry
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

-- --- drivers.clans (Backend Management Access) ---
-- This policy also uses auth.role() directly.
DROP POLICY IF EXISTS "Backend Management Access" ON drivers.clans;
CREATE POLICY "Backend Management Access" ON drivers.clans
    FOR ALL
    USING ((SELECT auth.role()) = 'service_role');


-- =========================================================================
-- 3. FUNCTION SEARCH_PATH HARDENING
-- =========================================================================
-- Pins the search_path to the explicit schema set for every project function.
-- Prevents theoretical search-path hijacking attacks.

-- --- drivers schema ---
ALTER FUNCTION drivers.bench_underqualified_recruits()
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.dismiss_recruit(text, integer)
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.get_stale_recruits(integer)
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.handle_recruit_buffer()
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.handle_recruit_event()
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.log_recruit_event()
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.purge_clanned_recruits()
    SET search_path = drivers, substrate, public;

ALTER FUNCTION drivers.purge_expired_blacklist()
    SET search_path = drivers, substrate, public;

-- --- substrate schema ---
ALTER FUNCTION substrate.format_longevity(integer)
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.handle_heritage_snapshot()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.purge_stale_discovery_cache()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.purge_stale_heritage()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.rotate_recruits()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.shred_clan_members()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.shred_clan_profile()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.shred_river_race()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.shred_scout_logs()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.shred_war_log()
    SET search_path = substrate, drivers, public;

ALTER FUNCTION substrate.tr_fn_rotate_recruits()
    SET search_path = substrate, drivers, public;

-- --- public schema ---
ALTER FUNCTION public.get_headhunter_context()
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.get_shadow_discovery_targets(integer)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.ingest_clan_members(jsonb)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.ingest_clan_profile(jsonb)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.ingest_player_battles(text, jsonb)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.ingest_river_race(jsonb)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.ingest_war_log(jsonb)
    SET search_path = public, drivers, substrate;

ALTER FUNCTION public.maintenance_janitor()
    SET search_path = public, drivers, substrate;

-- --- system schema ---
ALTER FUNCTION system.maintenance_janitor()
    SET search_path = system, drivers, substrate, public;
