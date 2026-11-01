### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip from ^6.44.0 to ^6.44.1 in monorepo catalogs and updated lockfile

**Why:** Apply safe Tier 1 patch update for devDependency knip

**Result:** Vitest monorepo suite passed 2365 of 2365 tests across all 220 test files cleanly

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-01
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 patch update for devDependency knip
  Change: Bumped knip from ^6.44.0 to ^6.44.1 in monorepo catalogs and updated lockfile
  Result: Vitest monorepo suite passed 2365 of 2365 tests across all 220 test files cleanly
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: be634210229eba5b13ba38beec9d0ceb7df55c18
-->
