-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- net.http_post from substrate.run_* takes pg_net's 5000ms default: 51 of 51
-- calls timed out, no status code ever, while the edge functions outlive it.
-- Cron reports success and the database learns nothing. Patches the LIVE
-- definition in place, because the live bodies differ from this repository's
-- and a CREATE OR REPLACE would swap in a Vault read that returns NULL.

DO $patch$
DECLARE
  r       record;
  def     text;
  patched text;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'substrate' AND p.proname LIKE 'run\_%'
  LOOP
    def := pg_get_functiondef(r.oid);
    CONTINUE WHEN def !~ 'net\.http_post\s*\(';
    CONTINUE WHEN def ~ 'timeout_milliseconds';

    patched := regexp_replace(def,
      '(net\.http_post\s*\((?:[^()]|\([^()]*\)|\([^()]*\([^()]*\)[^()]*\))*?)\)',
      '\1,' || chr(10) || '        timeout_milliseconds := 30000)', 'g');

    IF patched = def THEN
      RAISE WARNING 'http timeout not applied to %.%: call site did not match', r.nspname, r.proname;
      CONTINUE;
    END IF;

    EXECUTE patched;
    RAISE NOTICE 'http timeout set to 30000ms for %.%', r.nspname, r.proname;
  END LOOP;
END
$patch$;
