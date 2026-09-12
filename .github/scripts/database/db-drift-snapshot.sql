-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
--
-- Captures the live database state that audit-db-drift.mjs compares against the
-- migrations. Read-only: every statement here is a SELECT.
--
-- WHY THIS EXISTS
-- Stage 3 audits the migrations statically and has reported DB-UNAVAILABLE on
-- every night it has ever run, 6 of 6, because the Jules sandbox has no
-- Supabase and no docker. So nothing has ever compared what the migrations
-- declare against what the database actually contains, in either direction,
-- and the migrations are known to disagree both ways:
--
--   declared but absent  - master_migration's CREATE TABLE IF NOT EXISTS
--                          silently skipped columns against an existing table,
--                          which made report_heartbeat raise 42703 for 3.5 days
--   present but undeclared - five indexes on drivers.player_battles and cron
--                          job 38 exist only in the database; grepping the
--                          migrations for them returns nothing
--
-- During the 2026-09-06 incident that produced two wrong conclusions in a row,
-- including a near-miss where cron.unschedule would have deleted the only copy
-- of a job's definition.
--
-- Output is a single JSON document so the comparison stays a pure function over
-- data, unit-testable without a database.

SELECT jsonb_pretty(jsonb_build_object(
  'capturedFor', current_database(),

  -- Tables and their columns, so a column declared in a migration but missing
  -- live (the CREATE TABLE IF NOT EXISTS trap) is visible.
  'columns', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'column', column_name
    ) ORDER BY table_schema, table_name, column_name), '[]'::jsonb)
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'drivers', 'substrate', 'features')
  ),

  -- Indexes, the documented case of objects existing only in the database.
  'indexes', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', indexname
    ) ORDER BY schemaname, tablename, indexname), '[]'::jsonb)
    FROM pg_indexes
    WHERE schemaname IN ('public', 'drivers', 'substrate', 'features')
  ),

  -- Routines, with a flag for a credential-shaped literal in the body. A
  -- hardcoded API credential was reported inside a function body on
  -- 2026-09-06; it is in no tracked file, so no repository-side audit can
  -- ever see it. The body itself is never emitted, only the finding.
  'routines', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'hasEmbeddedSecret', (
        p.prosrc ~ '(?i)(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'
        OR p.prosrc ~ '(?i)(bearer\s+[A-Za-z0-9._-]{20,})'
        OR p.prosrc ~ '(?i)(service_role|anon)_?key\s*(:=|=)\s*''[^'']{20,}'''
      )
    ) ORDER BY n.nspname, p.proname), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'drivers', 'substrate', 'features')
  ),

  -- Row level security, so a table the baseline enables RLS on but the live
  -- database does not is caught.
  'rlsEnabled', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname
    ) ORDER BY n.nspname, c.relname), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relrowsecurity
      AND n.nspname IN ('public', 'drivers', 'substrate', 'features')
  )
)) AS snapshot;
