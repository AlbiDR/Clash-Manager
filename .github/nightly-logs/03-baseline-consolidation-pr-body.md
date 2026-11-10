### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20261004015410 and 20261004020000 into master baseline: aligned features.roster_view GRANT SELECT privilege order and revoked public execution on drivers internal routines

**Why:** Ensure master baseline accurately reflects hardened privileges and chronological DDL declarations

**Result:** pnpm audit:migrations PASS; fold-state reconciled 2 migrations, 17 migrations still to fold, DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-11-10
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Ensure master baseline accurately reflects hardened privileges and chronological DDL declarations
  Change: Folded 20261004015410 and 20261004020000 into master baseline: aligned features.roster_view GRANT SELECT privilege order and revoked public execution on drivers internal routines
  Result: pnpm audit:migrations PASS; fold-state reconciled 2 migrations, 17 migrations still to fold, DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: f1341a40b0bba4ec51f46557c9f1abb2dc42ee53
-->
