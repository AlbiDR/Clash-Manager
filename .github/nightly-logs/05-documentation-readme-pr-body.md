### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile useApkManager architecture, update state machine, and bridge brokering in core services README

**Why:** Document ApkUpdateState machine, downgrade prevention threat guards, native bridge permission checking, multi-tier download dispatching, and reactive computed labels per ADR Section II & IV

**Result:** git diff --check passed with 0 errors; Vitest useApkManager.spec.ts passed 13 of 13 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-07
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document ApkUpdateState machine, downgrade prevention threat guards, native bridge permission checking, multi-tier download dispatching, and reactive computed labels per ADR Section II & IV
  Change: Reconcile useApkManager architecture, update state machine, and bridge brokering in core services README
  Result: git diff --check passed with 0 errors; Vitest useApkManager.spec.ts passed 13 of 13 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 8163a14524e9c9f4b169c2fcecefbaaa0e6bc4b7
-->
