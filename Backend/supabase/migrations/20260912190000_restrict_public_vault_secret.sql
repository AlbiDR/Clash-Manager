-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Closes an anonymous read of every Vault secret: public.get_vault_secret is a
-- SECURITY DEFINER reader of vault.decrypted_secrets in a Data API exposed
-- schema, and carried PostgreSQL's default EXECUTE TO PUBLIC. Confirmed live
-- 2026-09-12. Only _shared/vault.ts calls it, as service_role.

REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.get_vault_secret(text) TO service_role;
