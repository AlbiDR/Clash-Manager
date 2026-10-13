### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- Bumped @vitejs/plugin-vue catalog entry from ^6.0.8 to ^6.0.10 and refreshed lockfile

**Why:** Safe Tier 1 patch update for @vitejs/plugin-vue

**Result:** pnpm test passed 220 test files (2343 passed) and pnpm test:nightly-control-plane passed all 12 sub-suites

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-13
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch update for @vitejs/plugin-vue
  Change: package.json -- Bumped @vitejs/plugin-vue catalog entry from ^6.0.8 to ^6.0.10 and refreshed lockfile
  Result: pnpm test passed 220 test files (2343 passed) and pnpm test:nightly-control-plane passed all 12 sub-suites
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: d9a2b772a67413f89c9fffd72c1d68dbe5bc3081
-->
