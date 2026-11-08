### Nightly Stage 6: Documentation TSDoc - Interface Contract Architect

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** docs(tsdoc): harden apkResolver interface contracts and inline decision annotations

**Why:** Synchronize Layer 1 APK release resolver interface contracts, ADR compliance notes, and threat annotations with implementation reality

**Result:** pnpm --dir Frontend-PWA type-check clean; Vitest apkResolver.spec.ts and apkResolverUtils.spec.ts passed 69 of 69; depcruise 0 violations

**Files changed:** .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/apkResolver.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-08
  Contract: a9f522cc73babe487aa3df1b083524daba64c0dd03c9e1b446dd4bd70c376bae
  Why: Synchronize Layer 1 APK release resolver interface contracts, ADR compliance notes, and threat annotations with implementation reality
  Change: docs(tsdoc): harden apkResolver interface contracts and inline decision annotations
  Result: pnpm --dir Frontend-PWA type-check clean; Vitest apkResolver.spec.ts and apkResolverUtils.spec.ts passed 69 of 69; depcruise 0 violations
  Files: .github/nightly-logs/06-documentation-tsdoc-coverage.log, Frontend-PWA/src/core/services/apkResolver.ts
  Nudges: 0
  Execution: 2e089b38be567839b11f854ba52c3a231349f04e
-->
