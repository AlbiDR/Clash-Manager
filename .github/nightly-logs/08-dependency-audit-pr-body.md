### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue to ^3.5.45 in monorepo catalogs and updated lockfile

**Why:** Safe automated Tier 1 patch update for core framework runtime

**Result:** pnpm audit:version clean, Frontend-PWA vitest passed 2387 of 2387 across 221 suites

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-07
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe automated Tier 1 patch update for core framework runtime
  Change: Bumped vue to ^3.5.45 in monorepo catalogs and updated lockfile
  Result: pnpm audit:version clean, Frontend-PWA vitest passed 2387 of 2387 across 221 suites
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: c37d3b694e2313654b27937fa44d91a5b3ef42eb
-->
