### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20260927005354_score_duels_per_round.sql and 20260927115312_record_watchdog_lease_failure_response.sql into master baseline; 19 migrations remain (next: 20261004015410_restore_roster_view_battle_stats_bridge.sql)

**Why:** Chronological folding of oldest pending migrations into canonical master_migration.sql target to eliminate schema divergence

**Result:** pnpm audit:migrations PASS (79 migrations examined, 187 baseline objects, 0 violations); fold-state reconciled 5 objects across 2 migrations leaving 19 pending; DB-UNAVAILABLE semantic gate deferred

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-11-01
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Chronological folding of oldest pending migrations into canonical master_migration.sql target to eliminate schema divergence
  Change: Folded 20260927005354_score_duels_per_round.sql and 20260927115312_record_watchdog_lease_failure_response.sql into master baseline; 19 migrations remain (next: 20261004015410_restore_roster_view_battle_stats_bridge.sql)
  Result: pnpm audit:migrations PASS (79 migrations examined, 187 baseline objects, 0 violations); fold-state reconciled 5 objects across 2 migrations leaving 19 pending; DB-UNAVAILABLE semantic gate deferred
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: ed26ecd78c6083ff533a604c1b4208ea4e09b823
-->
