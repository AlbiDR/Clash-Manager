### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip to ^6.41.0 and updated major version watchlist

**Why:** Apply Tier 1 minor bump to knip and refresh persistent watchlist

**Result:** pnpm knip executed and test suite passed 2318 of 2318 unit tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-11
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Apply Tier 1 minor bump to knip and refresh persistent watchlist
  Change: Bumped knip to ^6.41.0 and updated major version watchlist
  Result: pnpm knip executed and test suite passed 2318 of 2318 unit tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: fbd9bd131eeed7ed33fce09330273fbc6f4839de
-->
