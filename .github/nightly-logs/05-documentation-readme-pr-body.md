### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** docs(readme): Reconcile core/api README with WebAppDataSchema validation boundaries

**Why:** Reconciled Frontend-PWA/src/core/api/README.md to document WebAppDataSchema validation boundaries, deep structural parsing, and snapshot publication freshness markers.

**Result:** PASSED git diff --check and Vitest AppSchemas.spec.ts

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/api/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-15
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Reconciled Frontend-PWA/src/core/api/README.md to document WebAppDataSchema validation boundaries, deep structural parsing, and snapshot publication freshness markers.
  Change: docs(readme): Reconcile core/api README with WebAppDataSchema validation boundaries
  Result: PASSED git diff --check and Vitest AppSchemas.spec.ts
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/api/README.md
  Nudges: 0
  Execution: 79b8c1172105bfeab6dc7feabcd935abc74af62d
-->
