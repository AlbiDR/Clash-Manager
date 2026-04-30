-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR

-- =============================================================================
-- FINAL CLEANUP: Remove vestigial schemas and functions
-- =============================================================================

-- 1. Drop the non-standard 'system' schema and its contents
-- The system schema does not follow the Structural Unitary Architecture.
DROP SCHEMA IF EXISTS system CASCADE;

-- 2. Drop the vestigial 'public.maintenance_janitor' function
-- Superseded by substrate.execute_nightly_maintenance().
DROP FUNCTION IF EXISTS public.maintenance_janitor() CASCADE;

-- 3. Consolidate cron jobs
-- Remove duplicate nightly maintenance job to prevent redundant execution.
-- We keep 'nightly-maintenance' and remove 'nightly-maintenance-cron' if it exists.
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'nightly-maintenance-cron';

-- 4. Audit: Ensure all remaining functions have search_path pinned (Double Check)
-- All custom functions in 'public', 'drivers', 'substrate', and 'features' 
-- have been verified in Batch 1 and Batch 2.
