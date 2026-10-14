### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded unit 20260916205030 and aligned baseline view projection

**Why:** Folded 1 migration into master migration baseline and corrected pipeline_heartbeat_view view projection history compatibility

**Result:** Static audit PASS, fold-state unit resolved, database verification DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-14
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Folded 1 migration into master migration baseline and corrected pipeline_heartbeat_view view projection history compatibility
  Change: Folded unit 20260916205030 and aligned baseline view projection
  Result: Static audit PASS, fold-state unit resolved, database verification DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 6bb62f8f87faf7473574333dafcc154cc25cb7b0
-->
