-- Fix: headhunter Tournament Discovery (S2) anchor fetch failed every run with
--   "Could not find the function public.get_active_discovery_anchors(p_limit) in the schema cache"
-- The implementation lives in substrate.get_active_discovery_anchors, but the remote
-- data API only exposes the `public` schema to RPC. Its sibling discovery RPCs
-- (get_shadow_discovery_targets, get_discovery_cache) are public for this exact reason.
-- Add a thin public wrapper that delegates to the substrate implementation.

CREATE OR REPLACE FUNCTION public.get_active_discovery_anchors(p_limit integer DEFAULT 15)
 RETURNS TABLE(keyword text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'features', 'drivers', 'substrate', 'pg_temp'
AS $function$
    SELECT keyword FROM substrate.get_active_discovery_anchors(p_limit);
$function$;
