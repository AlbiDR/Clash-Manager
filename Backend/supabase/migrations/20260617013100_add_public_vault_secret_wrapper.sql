CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'substrate', 'vault', 'pg_temp'
AS $$
BEGIN
    RETURN substrate.get_vault_secret(p_name);
END;
$$;

COMMENT ON FUNCTION public.get_vault_secret(text) IS
    'Public RPC bridge for substrate.get_vault_secret. '
    'Required by Edge Function vault.ts which calls supabase.rpc() '
    'and can only reach the public schema via PostgREST.';
