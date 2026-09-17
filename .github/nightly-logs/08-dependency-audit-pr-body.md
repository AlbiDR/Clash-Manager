### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped knip to ^6.36.0 and updated major version watchlist

**Why:** Tier 1 minor bump maintenance

**Result:** pnpm test in Frontend-PWA passed 2017 tests across 205 files

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-09-17
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Tier 1 minor bump maintenance
  Change: Bumped knip to ^6.36.0 and updated major version watchlist
  Result: pnpm test in Frontend-PWA passed 2017 tests across 205 files
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json
  Nudges: 0
  Execution: fde77ef9b478cf710e93bb4ef914c3eeb590eb1d
-->
