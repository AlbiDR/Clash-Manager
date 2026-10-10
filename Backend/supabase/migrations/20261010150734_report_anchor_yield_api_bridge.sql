-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

BEGIN;
SET LOCAL lock_timeout = '3s';

-- The scanner calls the default public RPC schema, while the implementation
-- belongs to the private substrate schema. Forward the command without exposing
-- that schema or duplicating its anchor accounting and stale-anchor rules.
CREATE OR REPLACE FUNCTION public.report_anchor_yield(
    p_keyword text,
    p_yield integer,
    p_was_rate_limited boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT substrate.report_anchor_yield(p_keyword, p_yield, p_was_rate_limited);
$function$;

-- An invoker bridge needs access to the private routine under its caller's role.
-- Schema USAGE is a database privilege, not Data API schema exposure.
GRANT USAGE ON SCHEMA substrate TO service_role;
GRANT EXECUTE ON FUNCTION substrate.report_anchor_yield(text, integer, boolean)
    TO service_role;

REVOKE ALL ON FUNCTION public.report_anchor_yield(text, integer, boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_anchor_yield(text, integer, boolean)
    TO service_role;

COMMENT ON FUNCTION public.report_anchor_yield(text, integer, boolean) IS
    'Service-role-only API bridge to private discovery anchor yield accounting.';

COMMIT;
