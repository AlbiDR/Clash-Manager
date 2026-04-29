-- Grant PostgREST (web_anon + authenticated + service_role) access to the custom schemas
-- so the Supabase JS client's .schema() selector works for Edge Functions.

GRANT USAGE ON SCHEMA substrate TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA drivers TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA features TO anon, authenticated, service_role;

-- Grant table-level permissions for substrate
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA substrate TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA substrate TO authenticated;

-- Grant table-level permissions for drivers
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA drivers TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA drivers TO authenticated;

-- Grant table-level permissions for features
GRANT SELECT ON ALL TABLES IN SCHEMA features TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA features TO anon;

-- Apply to future tables too
ALTER DEFAULT PRIVILEGES IN SCHEMA substrate GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA drivers GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA features GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA features GRANT SELECT ON TABLES TO anon;
