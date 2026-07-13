-- Migration: 20260617013100_add_public_vault_secret_wrapper
-- Adds a public-schema wrapper for substrate.get_vault_secret so that
-- Edge Functions can invoke it via the PostgREST RPC interface.
--
-- [CONTEXT] The core implementation lives in substrate.get_vault_secret
-- which queries vault.decrypted_secrets. PostgREST only exposes the
-- public schema (and a controlled set of others), so calling
-- supabase.rpc('get_vault_secret') from vault.ts fails with:
-- "Could not find the function public.get_vault_secret(p_name)".
-- This wrapper bridges the gap without altering the substrate implementation.

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
