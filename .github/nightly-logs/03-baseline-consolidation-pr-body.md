### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** PARTIAL-RUN

In plain terms: no change was made to the project. This run ended as PARTIAL-RUN and the only file here is the log recording that.

**What was checked:** Migration 20260915190011_backend_health_and_safe_maintenance.sql blocked by static view history audit violation on pipeline_heartbeat_view expansion.

**Why:** Folding pipeline_heartbeat_view column expansion into baseline caused pnpm audit:migrations to fail due to historical migration column signature mismatch. Restored baseline checkpoint.

**Result:** PARTIAL-RUN: 30 migrations remaining; 20260915190011_backend_health_and_safe_maintenance.sql blocked by pnpm audit:migrations view history check.

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-11
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Folding pipeline_heartbeat_view column expansion into baseline caused pnpm audit:migrations to fail due to historical migration column signature mismatch. Restored baseline checkpoint.
  Change: Migration 20260915190011_backend_health_and_safe_maintenance.sql blocked by static view history audit violation on pipeline_heartbeat_view expansion.
  Result: PARTIAL-RUN: 30 migrations remaining; 20260915190011_backend_health_and_safe_maintenance.sql blocked by pnpm audit:migrations view history check.
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log
  Nudges: 0
  Execution: 0893719c511aab06e633f0ac00c4de9ecdab5985
-->
