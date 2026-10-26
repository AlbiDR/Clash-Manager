### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** Folded 20260916221814_add_resource_health_view.sql (features.resource_health_view) into master migration baseline.

**Why:** Consolidate oldest unfolded pending migration into master baseline per Stage 3 single-unit budget protocol.

**Result:** Migration audit PASS, fold-state updated (29 pending migrations remain, next: 20260917070416_smart_fold_player_battles.sql), DB verification DB-UNAVAILABLE.

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-26
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Consolidate oldest unfolded pending migration into master baseline per Stage 3 single-unit budget protocol.
  Change: Folded 20260916221814_add_resource_health_view.sql (features.resource_health_view) into master migration baseline.
  Result: Migration audit PASS, fold-state updated (29 pending migrations remain, next: 20260917070416_smart_fold_player_battles.sql), DB verification DB-UNAVAILABLE.
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log, Backend/supabase/migrations/20260531232406_master_migration.sql
  Nudges: 0
  Execution: eeaaa63a745e0bf0e055373010e4bde511feca41
-->
