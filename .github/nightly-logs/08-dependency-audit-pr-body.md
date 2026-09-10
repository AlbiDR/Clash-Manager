### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip from ^6.35.0 to ^6.35.1 in catalogs and updated pnpm-lock.yaml

**Why:** Safe Tier 1 patch update for devDependency

**Result:** pnpm test passed all 195 test files and 1826 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Why: Safe Tier 1 patch update for devDependency
  Change: Bumped knip from ^6.35.0 to ^6.35.1 in catalogs and updated pnpm-lock.yaml
  Result: pnpm test passed all 195 test files and 1826 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
-->
