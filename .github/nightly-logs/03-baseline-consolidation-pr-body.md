### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20260926233152_latest_battle_times_for_ingest_skip into baseline: added public.get_latest_battle_times function declaration, privileges, and comment

**Why:** Oldest pending migration with unfolded schema objects resolved per Stage 3 chronological folding specification

**Result:** pnpm audit:migrations PASS (79 migrations, 187 baseline objects), fold-state removed 20260926233152 (unfolded decreased 100 to 96, verbatim folded increased 133 to 137, 21 migrations remain to fold, next: 20260927005354_score_duels_per_round.sql), semantic DB-UNAVAILABLE

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-31
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Oldest pending migration with unfolded schema objects resolved per Stage 3 chronological folding specification
  Change: Folded 20260926233152_latest_battle_times_for_ingest_skip into baseline: added public.get_latest_battle_times function declaration, privileges, and comment
  Result: pnpm audit:migrations PASS (79 migrations, 187 baseline objects), fold-state removed 20260926233152 (unfolded decreased 100 to 96, verbatim folded increased 133 to 137, 21 migrations remain to fold, next: 20260927005354_score_duels_per_round.sql), semantic DB-UNAVAILABLE
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: 2408f1850c812141eae40ce426ab9cff7be6f997
-->
