### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue-router to ^5.4.0 and updated major version watchlist

**Why:** Routine dependency hygiene audit

**Result:** pnpm test passed 220 test files (2359 tests)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-22
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Routine dependency hygiene audit
  Change: Bumped vue-router to ^5.4.0 and updated major version watchlist
  Result: pnpm test passed 220 test files (2359 tests)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: 7777ba328cd16dbfbd39f241eb26ba0979bcf171
-->
