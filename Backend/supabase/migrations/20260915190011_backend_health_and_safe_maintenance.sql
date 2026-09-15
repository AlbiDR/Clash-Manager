-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- Keep the public heartbeat facade deliberately narrow. The PWA needs enough
-- information to distinguish an aging source from an in-progress update, but
-- must not receive operational messages or access the private substrate table.
CREATE OR REPLACE VIEW features.pipeline_heartbeat_view AS
  SELECT
    ph.component_id,
    ph.last_success_at,
    ph.status,
    ph.last_triggered_at,
    ph.last_failure_at
  FROM substrate.pipeline_heartbeat ph;

COMMENT ON VIEW features.pipeline_heartbeat_view IS
  'Anon-readable, public-safe pipeline status projection for the PWA. Exposes
   completion timing and status only; private operational messages remain in
   substrate.pipeline_heartbeat.';

GRANT SELECT ON features.pipeline_heartbeat_view TO authenticated, anon, service_role;

-- Index the referencing side of the two real foreign keys found by the
-- database advisor, and remove an exact duplicate recruit ordering index.
CREATE INDEX IF NOT EXISTS idx_clan_voyage_clan_tag
  ON drivers.clan_voyage (clan_tag);

CREATE INDEX IF NOT EXISTS idx_clan_voyage_contributions_player_tag
  ON drivers.clan_voyage_contributions (player_tag);

DROP INDEX IF EXISTS drivers.idx_recruits_status_score;

-- Each function body uses these schemas. Pinning that order prevents a caller
-- from changing name resolution through a mutable role-level search_path.
ALTER FUNCTION features.dismiss_recruits(jsonb)
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION features.undismiss_recruits(text[])
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION drivers.cancel_voyage(bigint)
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION drivers.initialize_voyage(integer, timestamp with time zone, timestamp with time zone)
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION drivers.sync_exclusion_cache()
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION drivers.schedule_voyage(integer, timestamp with time zone)
  SET search_path TO public, features, drivers, substrate, pg_temp;
ALTER FUNCTION drivers.activate_scheduled_voyage(bigint, integer, timestamp with time zone)
  SET search_path TO public, features, drivers, substrate, pg_temp;

-- Private-schema security-definer routines are not client RPC endpoints.
-- Revoke PostgreSQL's default PUBLIC execution grant without changing their workers.
DO $hardening$
DECLARE
  routine record;
BEGIN
  FOR routine IN
    SELECT p.oid::regprocedure AS identity
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('drivers', 'substrate')
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', routine.identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', routine.identity);
  END LOOP;
END;
$hardening$;

-- These seven public RPC bridges are invoked only by service-role Edge
-- Functions. Keeping their names public satisfies PostgREST's RPC resolver;
-- removing browser-role execution removes an unnecessary privileged endpoint.
REVOKE ALL ON FUNCTION public.get_active_discovery_anchors(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_discovery_cache(numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_headhunter_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_recent_scans(text[], timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_player_battles(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_recruits(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_epoch_state(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_active_discovery_anchors(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_discovery_cache(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_headhunter_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_scans(text[], timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_player_battles(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_recruits(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_epoch_state(integer) TO service_role;
