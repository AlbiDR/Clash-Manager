### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue-tsc from ^3.3.11 to ^3.3.13 in workspace catalog

**Why:** Maintenance patch update for vue-tsc

**Result:** pnpm --dir Frontend-PWA type-check passed and pnpm -r test passed 220 test files (2353 tests)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-17
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Maintenance patch update for vue-tsc
  Change: Bumped vue-tsc from ^3.3.11 to ^3.3.13 in workspace catalog
  Result: pnpm --dir Frontend-PWA type-check passed and pnpm -r test passed 220 test files (2353 tests)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: eb18cd0b9b60686882f27c88374d65430697efaa
-->
