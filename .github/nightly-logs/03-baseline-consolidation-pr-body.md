### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded migration 20261004015410 into master baseline: added features.get_active_roster_win_rates() function and permissions, updated features.roster_view; 18 pending migrations remain to fold next with 20261004020000

**Why:** Fold oldest pending migration into baseline to reconcile schema divergence

**Result:** pnpm audit:migrations PASS (0 violations across 79 migrations), fold-state 4 objects folded verbatim, DB-UNAVAILABLE semantic gate pending

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-11-05
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Fold oldest pending migration into baseline to reconcile schema divergence
  Change: Folded migration 20261004015410 into master baseline: added features.get_active_roster_win_rates() function and permissions, updated features.roster_view; 18 pending migrations remain to fold next with 20261004020000
  Result: pnpm audit:migrations PASS (0 violations across 79 migrations), fold-state 4 objects folded verbatim, DB-UNAVAILABLE semantic gate pending
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 7482ee6f835c7dce4582860bb03d68bce51221b2
-->
