// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * L1 Core: Environment Broker for ping.
 *
 * @remarks
 * Deliberately the thinnest CONFIG of any function in this repo: a health-check
 * handshake needs no vault-managed secrets (no ROYALE_API_KEYS, no CLAN_TAG), so this
 * skips `syncVault` entirely and reads straight from the deployed environment.
 * [DECISION LOG] No Supabase client either. The probe proves the edge runtime answers
 * and never touches the database (see `index.ts`), so this isolate does not hold the
 * service role key at all.
 */
export const CONFIG = {
  SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY") || "",
};
