### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden IngestionWorkBudget interface contracts and inline decision annotations

**Why:** Documented IngestionWorkBudget parameters, methods, lifecycle signals, ADR Section IV mappings, decision logs, and threat annotations.

**Result:** PASSED type-check and Vitest ingest-royale-data unit tests (35 passed across 432 tests).

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Backend/supabase/functions/ingest-royale-data/work-budget.ts

**Verified accurate:** Backend/supabase/functions/ingest-royale-data/work-budget.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-24
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented IngestionWorkBudget parameters, methods, lifecycle signals, ADR Section IV mappings, decision logs, and threat annotations.
  Change: docs(tsdoc): harden IngestionWorkBudget interface contracts and inline decision annotations
  Result: PASSED type-check and Vitest ingest-royale-data unit tests (35 passed across 432 tests).
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Backend/supabase/functions/ingest-royale-data/work-budget.ts
  Verified: Backend/supabase/functions/ingest-royale-data/work-budget.ts
  Nudges: 0
  Execution: 823d57d1e12b2d9e9f6104407522bbea507a59ef
-->
