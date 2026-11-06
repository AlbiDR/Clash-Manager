### Nightly Stage 5: Documentation README - Architecture Truth Architect

**Status:** CHANGED

In plain terms: this is a documentation change to 1 file in the documentation README area. Nothing about how the app runs is affected.

**What changed:** Reconcile apkResolverUtils metadata boundary validation guards in core services README

**Why:** Document isReleaseVersion, isReleaseBuildNumber, isSha256Digest, and isReleaseSizeBytes validation boundary type guards per ADR Section III

**Result:** git diff --check passed with 0 errors; Vitest apkResolverUtils.spec.ts passed 33 of 33 tests

**Files changed:** .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md

<!--
NIGHTLY_PR_METADATA:
  Domain: documentation
  Cycle: nightly-cycle/2026-11-06
  Contract: cea68a5bbba1bd2cbc6d3bdfe2639f37f3935b571beab59f5da1501b1180b22d
  Why: Document isReleaseVersion, isReleaseBuildNumber, isSha256Digest, and isReleaseSizeBytes validation boundary type guards per ADR Section III
  Change: Reconcile apkResolverUtils metadata boundary validation guards in core services README
  Result: git diff --check passed with 0 errors; Vitest apkResolverUtils.spec.ts passed 33 of 33 tests
  Files: .github/nightly-logs/05-documentation-readme-coverage.log, Frontend-PWA/src/core/services/README.md
  Nudges: 0
  Execution: 6701934e102938ec43c707c477d1adb7166a100f
-->
