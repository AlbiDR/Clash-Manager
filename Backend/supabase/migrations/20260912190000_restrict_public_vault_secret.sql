-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Makes the declared state match the live one. public.get_vault_secret reads
-- vault.decrypted_secrets as SECURITY DEFINER in a Data API exposed schema.
-- Production already restricts it (proacl: postgres and service_role only),
-- but no migration ever declared that, so a rebuild from the baseline would
-- take PostgreSQL's default EXECUTE TO PUBLIC and expose every Vault secret.

REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_vault_secret(text) TO service_role;
