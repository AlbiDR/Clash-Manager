### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped @vue/test-utils to ^2.5.0 in catalog

**Why:** Routine minor bump within v2 for test utilities

**Result:** All workspace unit tests passed (1826 tests across 195 test files)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Routine minor bump within v2 for test utilities
  Change: Bumped @vue/test-utils to ^2.5.0 in catalog
  Result: All workspace unit tests passed (1826 tests across 195 test files)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml
  Nudges: 0
-->
