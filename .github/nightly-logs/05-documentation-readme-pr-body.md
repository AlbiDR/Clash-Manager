### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** docs(readme): Reconcile query-royale-api README with client.ts vault environment broker role

**Why:** Document query-royale-api client.ts syncVault role and broker responsibilities in parity with sibling edge functions

**Result:** git diff --check reported zero errors, vitest passed 2365 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/query-royale-api/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-01
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document query-royale-api client.ts syncVault role and broker responsibilities in parity with sibling edge functions
  Change: docs(readme): Reconcile query-royale-api README with client.ts vault environment broker role
  Result: git diff --check reported zero errors, vitest passed 2365 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Backend/supabase/functions/query-royale-api/README.md
  Nudges: 0
  Execution: c7f65a9523d5f2210353383083693cd2a6987a6f
-->
