### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden ApiErrors interface contracts and inline decision annotations

**Why:** Documented Layer 1 Core NetworkError base class, constructor parameter, prototype inheritance mechanics, ADR Section III/IV references, decision logs, and threat annotations.

**Result:** PASSED type-check and Vitest ApiErrors unit tests (3/3)

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/api/ApiErrors.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-20
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented Layer 1 Core NetworkError base class, constructor parameter, prototype inheritance mechanics, ADR Section III/IV references, decision logs, and threat annotations.
  Change: docs(tsdoc): harden ApiErrors interface contracts and inline decision annotations
  Result: PASSED type-check and Vitest ApiErrors unit tests (3/3)
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/api/ApiErrors.ts
  Nudges: 0
  Execution: 65d4d0ecad88d1c60dabdc8f85a2d22d34fffe07
-->
