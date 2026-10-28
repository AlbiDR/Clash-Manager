### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vue-tsc from ^3.3.11 to ^3.3.13 in package.json catalog and updated major version watchlist

**Why:** Apply safe Tier 1 patch bump to vue-tsc and maintain dependency audit log

**Result:** Vitest 220 test files passed (2365 tests)

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-28
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply safe Tier 1 patch bump to vue-tsc and maintain dependency audit log
  Change: Bumped vue-tsc from ^3.3.11 to ^3.3.13 in package.json catalog and updated major version watchlist
  Result: Vitest 220 test files passed (2365 tests)
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json
  Nudges: 0
  Execution: f7bb4304c4862e5bd0a542ae2c05053189c429aa
-->
