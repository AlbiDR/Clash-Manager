### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden useHeaderScroll interface contracts and inline logic annotations

**Why:** Reconciles useHeaderScroll JSDoc/TSDoc interface contracts, ADR Section II mappings, and inline decision logs following recent KeepAlive verification

**Result:** PASS: vue-tsc and Vitest test suite clean

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/shared/composables/useHeaderScroll.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-09-18
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Reconciles useHeaderScroll JSDoc/TSDoc interface contracts, ADR Section II mappings, and inline decision logs following recent KeepAlive verification
  Change: docs(tsdoc): harden useHeaderScroll interface contracts and inline logic annotations
  Result: PASS: vue-tsc and Vitest test suite clean
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/shared/composables/useHeaderScroll.ts
  Nudges: 0
  Execution: cac396c6b65e48cfe4865c97fc1148872358616f
-->
