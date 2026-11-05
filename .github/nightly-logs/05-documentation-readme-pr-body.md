### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile useSyntheticMode architecture and interface contracts in core/services README

**Why:** Document UseSyntheticModeReturn interface contracts, resolution precedence, and dual search/hash query parameter parsing

**Result:** git diff --check passed with 0 errors; Vitest useSyntheticMode.spec.ts passed 4 of 4 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-05
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document UseSyntheticModeReturn interface contracts, resolution precedence, and dual search/hash query parameter parsing
  Change: Reconcile useSyntheticMode architecture and interface contracts in core/services README
  Result: git diff --check passed with 0 errors; Vitest useSyntheticMode.spec.ts passed 4 of 4 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 7482ee6f835c7dce4582860bb03d68bce51221b2
-->
