### Nightly Stage 9: Refactor - Structural Surgery Engineer

**Status:** CHANGED

In plain terms: this changes 1 code file, so the app's behaviour may be affected. No tests were added or changed alongside it.

**What changed:** refactor(core): fix stale store singleton state pollution in useBenchmarking

**Why:** Target C defect hunt: useBenchmarking retained stale module-level computed refs bound to discarded store instances across resets; refactored to use WeakMap payload memoization and store binding in setup scope

**Result:** 21/21 vitest unit tests passed; mutation check verified 16 failures when fix reverted; vue-tsc type-check and depcruise passed with 0 errors

**Files changed:** .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/core/services/useBenchmarking.ts

<!--
NIGHTLY_PR_METADATA:
  Domain: architecture
  Why: Target C defect hunt: useBenchmarking retained stale module-level computed refs bound to discarded store instances across resets; refactored to use WeakMap payload memoization and store binding in setup scope
  Change: refactor(core): fix stale store singleton state pollution in useBenchmarking
  Result: 21/21 vitest unit tests passed; mutation check verified 16 failures when fix reverted; vue-tsc type-check and depcruise passed with 0 errors
  Files: .github/nightly-logs/09-refactor-proposals-coverage.log, Frontend-PWA/src/core/services/useBenchmarking.ts
  Nudges: 0
-->
