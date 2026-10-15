### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden SupabaseTransport TSDoc interface contracts and inline decision annotations

**Why:** Documented transport retries, full jitter backoff, and statement timeouts

**Result:** Passed type-check and tests

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/api/SupabaseTransport.ts

**Verified accurate:** Frontend-PWA/src/core/api/SupabaseTransport.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-10-15
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Documented transport retries, full jitter backoff, and statement timeouts
  Change: docs(tsdoc): harden SupabaseTransport TSDoc interface contracts and inline decision annotations
  Result: Passed type-check and tests
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/api/SupabaseTransport.ts
  Verified: Frontend-PWA/src/core/api/SupabaseTransport.ts
  Nudges: 0
  Execution: 79b8c1172105bfeab6dc7feabcd935abc74af62d
-->
