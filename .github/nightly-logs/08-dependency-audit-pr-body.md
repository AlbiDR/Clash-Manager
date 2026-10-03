### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped dependency-cruiser to ^18.5.0 in monorepo catalog and refreshed lockfile

**Why:** Maintenance minor update for dependency hygiene

**Result:** pnpm test passed all test suites and depcruise checks

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-03
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Maintenance minor update for dependency hygiene
  Change: Bumped dependency-cruiser to ^18.5.0 in monorepo catalog and refreshed lockfile
  Result: pnpm test passed all test suites and depcruise checks
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: c1210c859e79562f093a8c689621d6b1648cae7e
-->
