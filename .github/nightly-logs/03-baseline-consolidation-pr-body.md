### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded unit 20260620142000_headhunter_epoch_guard.sql into master migration baseline

**Why:** Folded oldest pending migration object DIVERGENT FUNCTION substrate.run_headhunter_epoch_guard into baseline

**Result:** pnpm audit:migrations passed with 0 violations across 72 migrations; fold-state verified 20260620142000_headhunter_epoch_guard.sql folded

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-10
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Folded oldest pending migration object DIVERGENT FUNCTION substrate.run_headhunter_epoch_guard into baseline
  Change: Folded unit 20260620142000_headhunter_epoch_guard.sql into master migration baseline
  Result: pnpm audit:migrations passed with 0 violations across 72 migrations; fold-state verified 20260620142000_headhunter_epoch_guard.sql folded
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 2411d83cb4e93e7fb86aaf06fee58762bdd6128a
-->
