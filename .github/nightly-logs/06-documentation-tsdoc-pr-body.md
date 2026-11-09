### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden useNativeBridge interface contracts and inline decision annotations

**Why:** Define UseNativeBridgeReturn contract interface, document hardware brokerage and intent fallbacks, and record threat annotations per CleanStack Architecture Layer 1

**Result:** vue-tsc passed, Vitest passed 25 of 25 tests across useNativeBridge specs, depcruise reported 0 violations

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useNativeBridge.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-09
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Define UseNativeBridgeReturn contract interface, document hardware brokerage and intent fallbacks, and record threat annotations per CleanStack Architecture Layer 1
  Change: docs(tsdoc): harden useNativeBridge interface contracts and inline decision annotations
  Result: vue-tsc passed, Vitest passed 25 of 25 tests across useNativeBridge specs, depcruise reported 0 violations
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/useNativeBridge.ts
  Nudges: 0
  Execution: ee5d3fa812ffc0dfa85284c57b64d3144abd892c
-->
