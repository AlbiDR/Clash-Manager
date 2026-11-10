### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vite to ^8.3.7 in monorepo catalogs and updated lockfile

**Why:** Safe Tier 1 patch bump to contain dependency rot and align build tooling

**Result:** pnpm -r test passed across all workspaces; pnpm audit:version reported 0 drift lines

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-10
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch bump to contain dependency rot and align build tooling
  Change: Bumped vite to ^8.3.7 in monorepo catalogs and updated lockfile
  Result: pnpm -r test passed across all workspaces; pnpm audit:version reported 0 drift lines
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 885b9d359d42337773e8a67238ef07c8151aa300
-->
