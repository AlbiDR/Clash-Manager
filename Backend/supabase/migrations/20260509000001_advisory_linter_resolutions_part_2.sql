-- Migration: Advisory Center Linter Resolutions Part 2
-- This migration applies the search_path lock to all remaining SECURITY INVOKER functions.
-- Supabase lints require search_path to be explicitly set on all functions, not just SECURITY DEFINER ones.

DO $$ 
DECLARE
  func record;
BEGIN
  FOR func IN 
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'substrate', 'features', 'drivers') 
      AND p.prosecdef = false
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, features, drivers, substrate, pg_temp;', func.schema_name, func.function_name, func.args);
  END LOOP;
END $$;
