### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile useDeepLinkHandler presentation orchestration, reactivity contracts, and auto-scroll layout lifecycle guards in core services README

**Why:** Document UseDeepLinkHandlerReturn contract, DeepLinkTargetItem boundary, Set copy reactivity, single-shot execution guard, and layout settling per CleanStack Architecture Layer 1

**Result:** git diff --check passed with 0 errors; Vitest useDeepLinkHandler.spec.ts passed 9 of 9 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-08
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document UseDeepLinkHandlerReturn contract, DeepLinkTargetItem boundary, Set copy reactivity, single-shot execution guard, and layout settling per CleanStack Architecture Layer 1
  Change: Reconcile useDeepLinkHandler presentation orchestration, reactivity contracts, and auto-scroll layout lifecycle guards in core services README
  Result: git diff --check passed with 0 errors; Vitest useDeepLinkHandler.spec.ts passed 9 of 9 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 2e089b38be567839b11f854ba52c3a231349f04e
-->
