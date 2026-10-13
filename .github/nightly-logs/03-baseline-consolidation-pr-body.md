### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 2 migrations (20260915190011, 20260915192014) into master baseline

**Why:** Consolidates pipeline_heartbeat_view, search_path isolation, RLS drop policies, and process_queue permissions

**Result:** Static fold-state passed; 28 pending migrations remaining

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-13
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Consolidates pipeline_heartbeat_view, search_path isolation, RLS drop policies, and process_queue permissions
  Change: Folded 2 migrations (20260915190011, 20260915192014) into master baseline
  Result: Static fold-state passed; 28 pending migrations remaining
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 16498b8a95ba8506e2680533e0335ee94cd94ed9
-->
