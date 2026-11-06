### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vite to ^8.3.6 in monorepo catalogs and updated lockfile

**Why:** Safe Tier 1 patch bump to maintain Vite build tooling hygiene

**Result:** Vitest 221 test files and 2382 tests passed, pnpm audit:version clean

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-06
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe Tier 1 patch bump to maintain Vite build tooling hygiene
  Change: Bumped vite to ^8.3.6 in monorepo catalogs and updated lockfile
  Result: Vitest 221 test files and 2382 tests passed, pnpm audit:version clean
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 6701934e102938ec43c707c477d1adb7166a100f
-->
