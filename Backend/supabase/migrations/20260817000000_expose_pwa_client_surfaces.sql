-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


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
