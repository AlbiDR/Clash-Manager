### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped dependency-cruiser to ^18.3.1 and updated lockfile

**Why:** Patch bump for dependency-cruiser to maintain dependency hygiene

**Result:** pnpm test passed 204 test files and 1975 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Patch bump for dependency-cruiser to maintain dependency hygiene
  Change: Bumped dependency-cruiser to ^18.3.1 and updated lockfile
  Result: pnpm test passed 204 test files and 1975 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
-->
