### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vite to ^8.3.4 in catalogs and pnpm-lock.yaml

**Why:** Maintenance patch bump for build tool substrate

**Result:** pnpm test passed 2355 of 2355 unit and integration tests across 220 test files

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-18
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Maintenance patch bump for build tool substrate
  Change: Bumped vite to ^8.3.4 in catalogs and pnpm-lock.yaml
  Result: pnpm test passed 2355 of 2355 unit and integration tests across 220 test files
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: f39852f84c8f4ca20d4e2929b10830dfc2ab5b43
-->
