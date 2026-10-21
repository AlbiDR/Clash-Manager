### Nightly Stage 3: Baseline Consolidation - Declarative Schema Hardener

**Status:** PARTIAL-RUN

In plain terms: no change was made to the project. This run ended as PARTIAL-RUN and the only file here is the log recording that.

**What was checked:** Blocked by migration-quality audit failure on 20260817000000_expose_pwa_client_surfaces.sql view replacement rules

**Why:** Attempting to fold 20260915190011 caused audit-migrations failure due to historical view column narrowing in 20260817000000

**Result:** pnpm audit:migrations failed with VIEW HISTORY violation; restored source edits

**Files changed:** .github/nightly-logs/03-baseline-consolidation-coverage.log

<!--
NIGHTLY_PR_METADATA:
  Domain: database
  Cycle: nightly-cycle/2026-10-21
  Contract: 8c32444005e6edf746eda3ca4e7e0dbe86a11a195765389a2f7db2cce85373e0
  Why: Attempting to fold 20260915190011 caused audit-migrations failure due to historical view column narrowing in 20260817000000
  Change: Blocked by migration-quality audit failure on 20260817000000_expose_pwa_client_surfaces.sql view replacement rules
  Result: pnpm audit:migrations failed with VIEW HISTORY violation; restored source edits
  Files: .github/nightly-logs/03-baseline-consolidation-coverage.log
  Nudges: 0
  Execution: ce8710b941b2abb49539328c93af94a0d1cc6814
-->
