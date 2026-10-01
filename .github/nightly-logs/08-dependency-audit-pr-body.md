### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** package.json -- Bumped knip to ^6.39.0 in monorepo catalogs and updated major version watchlist

**Why:** Apply safe Tier 1 minor update for knip and maintain persistent Tier 2 major version watchlist.

**Result:** pnpm test:nightly-control-plane passed 105 of 105 tests across 11 suites

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-01
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 minor update for knip and maintain persistent Tier 2 major version watchlist.
  Change: package.json -- Bumped knip to ^6.39.0 in monorepo catalogs and updated major version watchlist
  Result: pnpm test:nightly-control-plane passed 105 of 105 tests across 11 suites
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: b8df57177f484bc188ddcf6c2de8a3568be1beee
-->
