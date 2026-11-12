### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20260705030000_voyage_history_pruning.sql by reconciling features.roster_view grant in master baseline; 19 migrations remain still to fold next 20260917070640_fix_battle_stats_today_branch_sargable.sql

**Why:** Target A chronological migration folding of oldest pending migration to advance declarative baseline consolidation

**Result:** pnpm audit:migrations PASS (79 migrations, 188 baseline objects, 0 violations); fold-state reconciled 20260705030000_voyage_history_pruning.sql with 19 migrations owning unfolded objects remaining; DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-11-12
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Target A chronological migration folding of oldest pending migration to advance declarative baseline consolidation
  Change: Folded 20260705030000_voyage_history_pruning.sql by reconciling features.roster_view grant in master baseline; 19 migrations remain still to fold next 20260917070640_fix_battle_stats_today_branch_sargable.sql
  Result: pnpm audit:migrations PASS (79 migrations, 188 baseline objects, 0 violations); fold-state reconciled 20260705030000_voyage_history_pruning.sql with 19 migrations owning unfolded objects remaining; DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 4b281451ccff9022d39f1f3114d3361e63d0140f
-->
