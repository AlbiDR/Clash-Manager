### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- Bumped knip to ^6.40.0 in monorepo catalog and refreshed pnpm-lock.yaml

**Why:** Tier 1 patch bump for knip

**Result:** pnpm test passed 219 test files and 2276 tests; pnpm test:nightly-lifecycle passed 50 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-07
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 patch bump for knip
  Change: package.json -- Bumped knip to ^6.40.0 in monorepo catalog and refreshed pnpm-lock.yaml
  Result: pnpm test passed 219 test files and 2276 tests; pnpm test:nightly-lifecycle passed 50 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 91959383fa5e7eb0efaa43bb0fa92a3d2005964f
-->
