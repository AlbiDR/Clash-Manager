### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Aligned vite to ^8.3.5 and bumped vue-tsc to ^3.3.14 in monorepo catalogs and updated lockfile

**Why:** Tier 1 patch bump of vue-tsc and alignment of vite catalog declaration across workspace manifests

**Result:** validate-project.ts passed with 0 drift lines, vue-tsc type-check passed, and pnpm -r test passed all 220 test files (2365 passed)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-31
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 patch bump of vue-tsc and alignment of vite catalog declaration across workspace manifests
  Change: Aligned vite to ^8.3.5 and bumped vue-tsc to ^3.3.14 in monorepo catalogs and updated lockfile
  Result: validate-project.ts passed with 0 drift lines, vue-tsc type-check passed, and pnpm -r test passed all 220 test files (2365 passed)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 8443973ac8f008f02fe95dd38a0a72e433739afc
-->
