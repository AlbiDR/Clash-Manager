-- Migration: Advisory Center Linter Resolutions
-- This migration hardens the database by fixing all search path vulnerabilities,
-- restrictive execution permissions, and consolidating overlapping/permissive RLS policies.

-- ====================================================================
-- PHASE 1 & 2: Search Path Hardening & Execution Revocation
-- ====================================================================
DO $$ 
DECLARE
  func record;
BEGIN
  FOR func IN 
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname IN ('public', 'substrate', 'features', 'drivers') 
      AND p.prosecdef = true
  LOOP
    -- Fix Search Path Mutable (SECURITY WARN)
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, features, drivers, substrate, pg_temp;', func.schema_name, func.function_name, func.args);
    
    -- Fix Public/Signed-In Can Execute SECURITY DEFINER (SECURITY WARN)
    -- We proactively revoke from all public and authenticated users.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM public, anon, authenticated;', func.schema_name, func.function_name, func.args);
  END LOOP;
END $$;

-- ====================================================================
-- PHASE 3: Grant Selective Access to PWA-Facing Functions
-- ====================================================================
-- Re-grant execute ONLY for the specific functions the PWA explicitly uses
GRANT EXECUTE ON FUNCTION features.dismiss_recruits(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION features.undismiss_recruits(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION features.trigger_backend_update() TO authenticated;
GRANT EXECUTE ON FUNCTION features.process_queue(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION features.ping() TO anon, authenticated;


-- ====================================================================
-- PHASE 4: RLS Policy Consolidation (SECURITY / PERFORMANCE WARN)
-- ====================================================================

-- drivers.clans
DROP POLICY IF EXISTS "Restricted Access Driver" ON drivers.clans;
CREATE POLICY "Service Role Full Access" ON drivers.clans AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Kept: "Public Read Access" for (public) SELECT using (true)

-- drivers.members
DROP POLICY IF EXISTS "Restricted Access Driver" ON drivers.members;
CREATE POLICY "Service Role Full Access" ON drivers.members AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Kept: "Public Read Access" for (public) SELECT using (true)

-- drivers.player_battles
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.player_battles;
-- Kept: "Public Read Access" for (public) SELECT using (true)
-- Kept: "Service Role Full Access" for (service_role) ALL

-- drivers.recruits
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.recruits;
-- Kept: "Public Read Access" for (public) SELECT using (true)
-- Kept: "Service Role Full Access" for (service_role) ALL

-- drivers.war_history
DROP POLICY IF EXISTS "Authenticated Read Access" ON drivers.war_history;
-- Kept: "Public Read Access" for (public) SELECT using (true)

-- drivers.push_subscriptions
-- Limit to authenticated users since true public access throws WARN for insert
DROP POLICY IF EXISTS "Allow public insertion of push subscriptions" ON drivers.push_subscriptions;
CREATE POLICY "Allow authenticated insertion of push subscriptions" ON drivers.push_subscriptions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (length((subscription->>'endpoint')::text) > 0);


-- ====================================================================
-- PHASE 5: Cleanup Unused Indexes (INFO)
-- ====================================================================
DROP INDEX IF EXISTS drivers.idx_war_history_week_id;
DROP INDEX IF EXISTS drivers.idx_clans_tag_date;
