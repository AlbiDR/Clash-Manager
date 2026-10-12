### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** PARTIAL-RUN

In plain terms: no change was made to the project. This run ended as PARTIAL-RUN and the only file here is the log recording that.

**What was checked:** Blocked on 20260915190011_backend_health_and_safe_maintenance.sql; 30 migrations remaining pending.

**Why:** Folding 5-column view definition for pipeline_heartbeat_view into baseline causes static audit failure due to column reduction conflict with immutable historical migration 20260817000000_expose_pwa_client_surfaces.sql.

**Result:** Static migration audit PASS; fold-state PENDING; database verification DB-UNAVAILABLE.

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-12
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Folding 5-column view definition for pipeline_heartbeat_view into baseline causes static audit failure due to column reduction conflict with immutable historical migration 20260817000000_expose_pwa_client_surfaces.sql.
  Change: Blocked on 20260915190011_backend_health_and_safe_maintenance.sql; 30 migrations remaining pending.
  Result: Static migration audit PASS; fold-state PENDING; database verification DB-UNAVAILABLE.
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log
  Nudges: 0
  Execution: 9eb60b957eabb3de784515d788e2d13e16423642
-->
