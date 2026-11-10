### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden useNetworkInfo interface contracts and inline decision annotations

**Why:** Reconcile useNetworkInfo interface contracts and telemetry degradation annotations with CleanStack ADR Section I & IV

**Result:** vue-tsc type-check passed 0 errors; Vitest useNetworkInfo.spec.ts passed 9 of 9 tests; eslint passed 0 errors

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useNetworkInfo.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-10
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Reconcile useNetworkInfo interface contracts and telemetry degradation annotations with CleanStack ADR Section I & IV
  Change: docs(tsdoc): harden useNetworkInfo interface contracts and inline decision annotations
  Result: vue-tsc type-check passed 0 errors; Vitest useNetworkInfo.spec.ts passed 9 of 9 tests; eslint passed 0 errors
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useNetworkInfo.ts
  Nudges: 0
  Execution: 19efc37a38f2fd6acf28f5420402c4990b7ac9e7
-->
