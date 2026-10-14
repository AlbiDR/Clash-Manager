### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue to ^3.5.44 in catalogs and refreshed lockfile

**Why:** Safe Tier 1 patch bump for vue within current major

**Result:** pnpm -r test passed 2343 tests across 220 test files, 0 failures

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-14
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch bump for vue within current major
  Change: Bumped vue to ^3.5.44 in catalogs and refreshed lockfile
  Result: pnpm -r test passed 2343 tests across 220 test files, 0 failures
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 8ada8cafc296f4d2c0d823e65113cdf86c0e33d0
-->
