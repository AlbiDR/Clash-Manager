### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** PARTIAL-RUN

In plain terms: no change was made to the project. This run ended as PARTIAL-RUN and the only file here is the log recording that.

**What was checked:** Stopped folding at 20260915190011_backend_health_and_safe_maintenance.sql due to view history audit constraint on features.pipeline_heartbeat_view

**Why:** Altering pipeline_heartbeat_view column output structure in baseline causes audit:migrations view history check to fail

**Result:** 31 migrations pending; baseline restored to unedited checkpoint state

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-20
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Altering pipeline_heartbeat_view column output structure in baseline causes audit:migrations view history check to fail
  Change: Stopped folding at 20260915190011_backend_health_and_safe_maintenance.sql due to view history audit constraint on features.pipeline_heartbeat_view
  Result: 31 migrations pending; baseline restored to unedited checkpoint state
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log
  Nudges: 0
  Execution: 017456ec29c448c3baa59bd8a9d3f8f00304f77d
-->
