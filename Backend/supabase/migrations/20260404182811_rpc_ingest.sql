-- RPC entry points for the Edge Function to write into non-public schemas
-- without requiring those schemas to be exposed in PostgREST's db_schema list.

CREATE OR REPLACE FUNCTION public.ingest_clan_profile(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = substrate, public
AS $$
BEGIN
  INSERT INTO substrate.raw_clan_profile (payload) VALUES (p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.ingest_clan_members(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = substrate, public
AS $$
BEGIN
  INSERT INTO substrate.raw_clan_members (payload) VALUES (p_payload);
END;
$$;

-- Grant execute to service_role (used by Edge Functions)
GRANT EXECUTE ON FUNCTION public.ingest_clan_profile(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_clan_members(jsonb) TO service_role;
