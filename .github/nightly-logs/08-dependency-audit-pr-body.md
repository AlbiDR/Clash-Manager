### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue to ^3.5.43 in monorepo catalogs and updated lockfile

**Why:** Safe Tier 1 patch update for vue with verified passing workspace test suite

**Result:** 2034 workspace unit tests passing across all packages

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-19
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch update for vue with verified passing workspace test suite
  Change: Bumped vue to ^3.5.43 in monorepo catalogs and updated lockfile
  Result: 2034 workspace unit tests passing across all packages
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: bb5881031be7e9cc3e6169cd3787fd329ab856fc
-->
