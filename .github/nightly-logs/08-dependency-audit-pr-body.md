### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip to ^6.38.0 and updated major version watchlist

**Why:** Safe minor update for devDependency knip

**Result:** pnpm test passed 209 test files and 2102 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-27
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe minor update for devDependency knip
  Change: Bumped knip to ^6.38.0 and updated major version watchlist
  Result: pnpm test passed 209 test files and 2102 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 1
  Execution: f277a92e36dd4142d076abae1ba3a04bef43cc0e
-->
