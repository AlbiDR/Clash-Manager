### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconciled ingest-royale-data README with deep depth optimizations and reliability guards

**Why:** Document isAlreadyIngested RPC skipping, two-phase shadow lead registry sync, and dead recruit purging

**Result:** PASSED (git diff --check clean, monorepo vitest passed 2102 tests)

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/ingest-royale-data/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-29
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document isAlreadyIngested RPC skipping, two-phase shadow lead registry sync, and dead recruit purging
  Change: Reconciled ingest-royale-data README with deep depth optimizations and reliability guards
  Result: PASSED (git diff --check clean, monorepo vitest passed 2102 tests)
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/ingest-royale-data/README.md
  Nudges: 0
  Execution: c3d469a2427e150d0d02c017f736fb9e1dc296c0
-->
