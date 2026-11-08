### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded migration 20260705030000_voyage_history_pruning.sql by reconciling SELECT privilege on features.roster_view; 18 migrations remain to fold with 20261004015410_restore_roster_view_battle_stats_bridge.sql next

**Why:** Reconciled divergent grant privilege in master baseline to match chronological incremental migration definition

**Result:** pnpm audit:migrations passed with 0 violations across 79 migrations; fold-state confirmed 20260705030000_voyage_history_pruning.sql folded and removed from pending migrations; DB-UNAVAILABLE semantic verification pending CI

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-11-08
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Reconciled divergent grant privilege in master baseline to match chronological incremental migration definition
  Change: Folded migration 20260705030000_voyage_history_pruning.sql by reconciling SELECT privilege on features.roster_view; 18 migrations remain to fold with 20261004015410_restore_roster_view_battle_stats_bridge.sql next
  Result: pnpm audit:migrations passed with 0 violations across 79 migrations; fold-state confirmed 20260705030000_voyage_history_pruning.sql folded and removed from pending migrations; DB-UNAVAILABLE semantic verification pending CI
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 2e089b38be567839b11f854ba52c3a231349f04e
-->
