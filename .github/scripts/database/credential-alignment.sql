-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
--
-- Answers one question that decides whether the credential fan-out can safely
-- be reduced: is the literal embedded in a live routine body the SAME value
-- the deploy currently syncs into Vault, or a different one?
--
-- WHY IT MATTERS
-- The declared versions of the substrate.run_* functions read their token from
-- Vault; the live versions carry a literal. Switching the live database to the
-- declared definitions is therefore safe only if the literal and the Vault
-- value are the same secret. If they differ, the database would start sending
-- a token the edge runtime does not accept, and every cron caller would begin
-- failing with 401 at once. Guessing which case holds is not acceptable when
-- the cost of being wrong is a silent outage of the whole ingest path.
--
-- WHAT LEAVES THE DATABASE
-- Names and booleans. The comparison happens inside Postgres, so no credential
-- value, and no hash of one, is ever emitted. Note that Vault is synced FROM
-- GitHub Secrets on every deploy, so "matches the Vault value" is equivalent
-- to "matches the GitHub secret" without ever putting the GitHub value into a
-- statement, which is what pg_stat_statements would have recorded verbatim.
--
-- No secret-shaped regex appears here on purpose. db-drift-snapshot.sql owns
-- those rules; duplicating them is how this repository ended up with three
-- checkers that disagreed about the same baseline.

SELECT jsonb_pretty(jsonb_build_object(

  -- Names only. Tells us whether a credential the declared functions read is
  -- present in Vault at all, which is the difference between adding a name to
  -- the deploy's sync list being a create or an overwrite of a working value.
  'vaultSecretNames', (
    SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
    FROM vault.secrets s
  ),

  -- Routines whose body contains a value that is CURRENTLY in Vault. Exact
  -- substring, not a pattern, so there is nothing to tune and no false
  -- positive to argue about.
  --
  -- The length floor keeps short configuration values out: CLAN_TAG is nine
  -- characters and legitimately appears in bodies, and matching it would say
  -- "this function embeds a current secret" about a clan tag.
  'routinesEmbeddingVaultValues', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', r.nspname,
      'name', r.proname,
      'vaultNames', r.matches
    ) ORDER BY r.nspname, r.proname), '[]'::jsonb)
    FROM (
      SELECT n.nspname, p.proname, (
        SELECT jsonb_agg(v.name ORDER BY v.name)
        FROM vault.decrypted_secrets v
        WHERE length(v.decrypted_secret) >= 20
          AND position(v.decrypted_secret in p.prosrc) > 0
      ) AS matches
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'drivers', 'substrate', 'features')
    ) AS r
    WHERE r.matches IS NOT NULL
  )
)) AS alignment;
