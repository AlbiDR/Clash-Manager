### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile useNetworkInfo architecture, singleton contracts, and degradation heuristics in core services README

**Why:** Document useNetworkInfo interface contracts, reactive module singleton state, and degradation thresholds following recent Layer 1 contract hardening

**Result:** git diff --check passed with 0 errors; pnpm -C Frontend-PWA test useNetworkInfo.spec.ts passed 9 of 9 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-11
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document useNetworkInfo interface contracts, reactive module singleton state, and degradation thresholds following recent Layer 1 contract hardening
  Change: Reconcile useNetworkInfo architecture, singleton contracts, and degradation heuristics in core services README
  Result: git diff --check passed with 0 errors; pnpm -C Frontend-PWA test useNetworkInfo.spec.ts passed 9 of 9 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 6febf422ff3e309d6072562cf6e4c092f1939515
-->
