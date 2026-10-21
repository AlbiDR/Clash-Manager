### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped dependency-cruiser to ^18.7.0 in monorepo catalog and refreshed pnpm-lock.yaml

**Why:** Safe patch update for devDependency dependency-cruiser

**Result:** depcruise reported 0 violations across 533 modules and pnpm test passed all workspace tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-21
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe patch update for devDependency dependency-cruiser
  Change: Bumped dependency-cruiser to ^18.7.0 in monorepo catalog and refreshed pnpm-lock.yaml
  Result: depcruise reported 0 violations across 533 modules and pnpm test passed all workspace tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 4b281274f88cc83f04607063dbf68e06b9261804
-->
