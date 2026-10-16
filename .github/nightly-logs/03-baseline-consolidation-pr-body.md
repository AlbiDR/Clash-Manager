### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** PARTIAL-RUN

In plain terms: no change was made to the project. This run ended as PARTIAL-RUN and the only file here is the log recording that.

**What was checked:** Blocked folding 20260915190011_backend_health_and_safe_maintenance.sql due to historical view projection audit restriction

**Why:** Folding updated pipeline_heartbeat_view into baseline violates audit:migrations view output column retention check against retained migration 20260817000000_expose_pwa_client_surfaces.sql

**Result:** BLOCKED: pnpm audit:migrations failed on viewHistoryViolations

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-16
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Folding updated pipeline_heartbeat_view into baseline violates audit:migrations view output column retention check against retained migration 20260817000000_expose_pwa_client_surfaces.sql
  Change: Blocked folding 20260915190011_backend_health_and_safe_maintenance.sql due to historical view projection audit restriction
  Result: BLOCKED: pnpm audit:migrations failed on viewHistoryViolations
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log
  Nudges: 0
  Execution: 1e3f3e3ea7b0335f906f162a3ed099eddfae5b25
-->
