-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
--
-- Tighten autovacuum on the two churn-heavy domain tables.
--
-- [Root Cause] Neither table carried any per-table autovacuum override, so both
-- inherited the cluster default autovacuum_vacuum_scale_factor of 0.2. On
-- drivers.player_battles (112k rows) that meant autovacuum waited for 22,455
-- dead tuples before running. purge_stale_battles() deletes a month of rows in
-- one statement each night, so the resulting dead tuples sat as bloat until the
-- threshold happened to trip. Measured 2026-09-06: 21 MB wasted in
-- recruit_ledger (bloat ratio 23.8) and 16 MB in player_battles_pkey.
--
-- [Preventive Action] A 0.05 scale factor makes autovacuum run four times
-- sooner, so reclamation tracks the nightly purges instead of lagging them by
-- weeks. Both tables are now under 3 MB after a one-off VACUUM FULL and
-- REINDEX, so each vacuum pass is cheap; frequent small passes also suit a
-- burstable instance far better than rare large ones.
--
-- Deliberately NOT applied to cron.job_run_details: that table is owned by
-- supabase_admin, and it now has explicit retention via
-- substrate.purge_cron_history(), which bounds it by design rather than by
-- vacuum cadence.

BEGIN;

ALTER TABLE drivers.player_battles SET (
    autovacuum_vacuum_scale_factor  = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE drivers.recruit_ledger SET (
    autovacuum_vacuum_scale_factor  = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);

COMMIT;
