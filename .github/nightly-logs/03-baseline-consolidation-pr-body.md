### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20260926233013_event_gate_voyage_finalization.sql (drivers.sync_voyage_finalization_job, drivers.on_voyage_active_change, trg_voyage_finalization_gate, VOYAGE_FINALIZATION_SCHEDULE, finalize_expired_voyages comment)

**Why:** Resumable fold of oldest pending migration into master baseline per Stage 3 contract

**Result:** PASS: audit:migrations 0 violations, fold-state migration verified as folded; 22 migrations remain pending; db verification DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-30
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Resumable fold of oldest pending migration into master baseline per Stage 3 contract
  Change: Folded 20260926233013_event_gate_voyage_finalization.sql (drivers.sync_voyage_finalization_job, drivers.on_voyage_active_change, trg_voyage_finalization_gate, VOYAGE_FINALIZATION_SCHEDULE, finalize_expired_voyages comment)
  Result: PASS: audit:migrations 0 violations, fold-state migration verified as folded; 22 migrations remain pending; db verification DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 6e8f43fbdc89b8f0d91831ed0b501f7d2d190554
-->
