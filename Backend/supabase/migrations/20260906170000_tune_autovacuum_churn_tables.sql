-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR
-- Both tables inherited the default 0.2 autovacuum scale factor, so reclamation
-- lagged the nightly purges by weeks: 21 MB wasted in recruit_ledger and 16 MB
-- in player_battles_pkey, measured 2026-09-06. Rationale in the commit message.

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
