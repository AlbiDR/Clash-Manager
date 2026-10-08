### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded unit 20260620142000_headhunter_epoch_guard.sql into master migration

**Why:** Integrated headhunter_epoch_state, update_epoch_state, and run_headhunter_epoch_guard into baseline

**Result:** PASS (audit:migrations PASS, fold-state 28 remaining, DB-UNAVAILABLE)

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-08
  Contract: fce15bf60f686eba9489d1297c90bb03fbaaff69d64886cf62eb35d47f90f307
  Why: Integrated headhunter_epoch_state, update_epoch_state, and run_headhunter_epoch_guard into baseline
  Change: Folded unit 20260620142000_headhunter_epoch_guard.sql into master migration
  Result: PASS (audit:migrations PASS, fold-state 28 remaining, DB-UNAVAILABLE)
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: a97500936970b64f6be66b130a66a226d11de5bc
-->
