### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped dependency-cruiser to ^18.6.0 in monorepo catalogs

**Why:** Safe Tier 1 patch update for dependency auditor and graph enforcer

**Result:** Vitest 219 test files passed 2340 tests, depcruise 0 violations across 532 modules

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-12
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch update for dependency auditor and graph enforcer
  Change: Bumped dependency-cruiser to ^18.6.0 in monorepo catalogs
  Result: Vitest 219 test files passed 2340 tests, depcruise 0 violations across 532 modules
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: f165888a2697eed23be4bb9efab81834722f4908
-->
