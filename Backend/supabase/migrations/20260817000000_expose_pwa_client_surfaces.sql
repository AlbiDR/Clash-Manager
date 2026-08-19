-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- Expose the three PWA client surfaces that were unreachable over the Data API
-- =============================================================================
--
-- ROOT CAUSE
-- ----------
-- Three frontend call sites addressed internal schemas directly:
--
--   Frontend-PWA/src/core/api/SupabaseClient.ts   substrate.pipeline_heartbeat  (read)
--   Frontend-PWA/src/core/api/SupabaseClient.ts   drivers.recruit_blacklist     (read)
--   Frontend-PWA/src/core/api/MaintenanceClient.ts drivers.push_subscriptions   (insert)
--
-- The remote Data API exposes only `public`, `storage`, `graphql_public` and
-- `features`, so PostgREST rejected all three with HTTP 406 / PGRST106
-- ("Invalid schema") before a single row was touched. Note that
-- Backend/supabase/config.toml lists `substrate` and `drivers` as exposed; that
-- local value never matched the remote project, which is what let this drift
-- go unnoticed.
--
-- WHY IT WAS SILENT
-- -----------------
-- Every one of the three call sites degrades gracefully: the heartbeat error is
-- discarded, the blacklist error is warned-and-continued, and the push insert
-- only logs. So the app showed a permanently null pipeline freshness stamp, a
-- permanently empty client-side blacklist, and never persisted a push
-- subscription -- with no error surfaced to the user.
--
-- PREVENTIVE ACTION
-- -----------------
-- Reads move to `features` views and the write moves to a `features`
-- SECURITY DEFINER RPC, which is the pattern every already-working client
-- surface in this database uses (features.roster_view, features.headhunter_view,
-- features.dismiss_recruits, ...). Both views expose the minimum column set the
-- client actually consumes rather than `SELECT *`, so widening a base table
-- never silently widens the anon-reachable surface.
--
-- Every statement below is idempotent (CREATE OR REPLACE / GRANT / COMMENT), so
-- a partially applied push is safe to re-run without a repair step.

-- -----------------------------------------------------------------------------
-- 1. Pipeline freshness (read)
-- -----------------------------------------------------------------------------
-- Only the component identity and its last success stamp are exposed. The rest
-- of substrate.pipeline_heartbeat is operational internals (error payloads,
-- attempt counters) that the client neither reads nor should see.
CREATE OR REPLACE VIEW features.pipeline_heartbeat_view AS
  SELECT
    ph.component_id,
    ph.last_success_at
  FROM substrate.pipeline_heartbeat ph;

COMMENT ON VIEW features.pipeline_heartbeat_view IS
  'Anon-readable projection of substrate.pipeline_heartbeat, limited to the
   component identity and its last success timestamp. Backs the PWA "last
   synced" indicator. Before this view the PWA queried substrate directly and
   PostgREST rejected it with PGRST106, so the indicator always read null.';

GRANT SELECT ON features.pipeline_heartbeat_view TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 2. Recruit blacklist (read)
-- -----------------------------------------------------------------------------
-- Expired rows are filtered out here as well as being pruned by the scheduled
-- maintenance job. The prune runs on a schedule, so between runs an expired row
-- is still present in the table; leaking it would keep suppressing a recruit
-- whose 30-day temporal contract has already lapsed.
--
-- Only player_tag is exposed. The eviction reason, cached name, score and full
-- stat snapshot stay internal.
CREATE OR REPLACE VIEW features.recruit_blacklist_view AS
  SELECT
    bl.player_tag
  FROM drivers.recruit_blacklist bl
  WHERE bl.expires_at IS NULL
     OR bl.expires_at > now();

COMMENT ON VIEW features.recruit_blacklist_view IS
  'Anon-readable projection of drivers.recruit_blacklist, limited to the tags of
   entries whose temporal contract has not lapsed. Lets the PWA suppress a
   dismissed recruit immediately rather than waiting for the next server-side
   headhunter refresh.';

GRANT SELECT ON features.recruit_blacklist_view TO authenticated, anon, service_role;

-- -----------------------------------------------------------------------------
-- 3. Push subscription registration (write)
-- -----------------------------------------------------------------------------
-- This one is deliberately NOT an insertable view. An anon-writable view would
-- let any caller append unbounded rows to drivers.push_subscriptions. Routing
-- through a SECURITY DEFINER function instead means the endpoint is validated
-- and a repeat registration updates the existing row rather than adding another.
--
-- Scope note: this is a genuinely new anon-reachable write path, because the old
-- direct insert never actually reached the database. Deduplicating on endpoint
-- bounds growth per device, but it does not rate-limit a caller who submits many
-- distinct fabricated endpoints. If that becomes a concern the mitigation is a
-- rate limit at the edge, not a change here.
CREATE OR REPLACE FUNCTION features.register_push_subscription(subscription jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
DECLARE
    v_endpoint TEXT;
    v_updated  INTEGER := 0;
BEGIN
    -- [GUARD] The endpoint is the identity of a push subscription. Without it the
    -- row is unusable by the notification worker, so reject rather than store junk.
    v_endpoint := subscription->>'endpoint';

    IF v_endpoint IS NULL OR length(trim(v_endpoint)) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Push subscription is missing an endpoint.'
        );
    END IF;

    -- Idempotent re-registration: browsers hand back the same endpoint when a
    -- subscription is refreshed, and the PWA re-subscribes on every permission
    -- grant. Updating in place keeps the table from growing per grant.
    -- The table column and the function parameter are both named `subscription`,
    -- so every reference is qualified: `ps.` for the column, the function name
    -- for the parameter. An unqualified reference raises "column reference is
    -- ambiguous" under plpgsql's default variable_conflict setting.
    UPDATE drivers.push_subscriptions AS ps
       SET subscription = register_push_subscription.subscription,
           updated_at   = now()
     WHERE ps.subscription->>'endpoint' = v_endpoint;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        INSERT INTO drivers.push_subscriptions (subscription)
        VALUES (register_push_subscription.subscription);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'refreshed', v_updated > 0,
        'message', 'Push subscription registered.'
    );
END;
$function$;

COMMENT ON FUNCTION features.register_push_subscription(jsonb) IS
  'Registers or refreshes a Web Push subscription for the PWA. Replaces the
   PWA''s former direct insert into drivers.push_subscriptions, which PostgREST
   rejected with PGRST106 because the drivers schema is not exposed, so no
   subscription was ever persisted. Deduplicates on the subscription endpoint.';

GRANT EXECUTE ON FUNCTION features.register_push_subscription(jsonb) TO authenticated, anon, service_role;
