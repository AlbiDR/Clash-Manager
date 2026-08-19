-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Fix headhunter-scanner profiler: PostgREST cannot see the `drivers` schema
-- =============================================================================
--
-- SYMPTOM
-- -------
-- The headhunter has produced zero new recruits since 2026-07-30 even though
-- discovery (shadow scout + tournament search) keeps finding dozens of
-- candidates per run. substrate.governance_telemetry shows every HEADHUNTER_SCAN
-- as status SUCCESS, but its embedded audit_log records the PROFILING stage
-- failing on its very first query:
--
--   "Invalid schema: drivers"
--
-- ROOT CAUSE
-- ----------
-- Backend/supabase/functions/headhunter-scanner/stages/profiler.ts queried
-- drivers.recruits directly through the PostgREST client:
--
--   supabase.schema('drivers').from('recruits')...
--
-- The `authenticator` role's `pgrst.db_schemas` setting (what the Data API
-- actually exposes in production) is `public, storage, graphql_public,
-- features` -- there is no `drivers` in it. Every other read/write in this
-- codebase goes through a `public.*` SECURITY DEFINER RPC precisely to cross
-- that boundary (sync_recruits, get_stale_recruits, get_recruits_fate,
-- report_dead_recruit, get_top_50_threshold, ...); profiler.ts's two direct
-- `.schema('drivers')` calls were the only reads that skipped it.
-- Backend/supabase/config.toml's local `schemas` list happens to include
-- `drivers`, which is why this never reproduced locally.
--
-- Because runProfiler()'s outer try/catch re-throws (by design, so the
-- scanner orchestrator can log a stage-level error), the very first
-- `.schema('drivers')` call throws before a single candidate is fetched from
-- the Royale API or ingested, so PROFILING aborts immediately every run.
-- RESCAN and the epoch guard are unaffected: rescan.ts already goes through
-- get_stale_recruits/sync_recruits RPCs.
--
-- PREVENTIVE ACTION
-- -----------------
-- Add public.get_recent_scans(), mirroring the existing get_stale_recruits()/
-- get_recruits_fate() pattern, to replace the first direct query (the 30-minute
-- re-fetch de-dupe). The second direct query (which tags already exist, for the
-- new-vs-refresh split) is replaced by reusing get_recruits_fate(), which
-- already returns a row per known tag with no scan-recency filter -- exactly
-- the existing-tag check profiler.ts needs, with no new RPC required.

CREATE OR REPLACE FUNCTION public.get_recent_scans(p_tags text[], p_since timestamptz)
 RETURNS TABLE(player_tag text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.player_tag
    FROM drivers.recruits r
    WHERE r.player_tag = ANY(p_tags)
      AND r.last_scan > p_since;
END;
$function$;

COMMENT ON FUNCTION public.get_recent_scans(text[], timestamptz) IS
  'Public-schema wrapper reached by the headhunter-scanner profiler stage,
   which cannot see drivers.recruits directly over the Data API. Returns the
   subset of p_tags scanned more recently than p_since, so the profiler can
   skip re-fetching them from the Royale API within its 30-minute window.';
