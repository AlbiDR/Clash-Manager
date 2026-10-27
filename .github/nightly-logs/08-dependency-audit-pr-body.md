### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped vite from ^8.3.4 to ^8.3.5 in catalog

**Why:** Align vite catalog entry with latest patch

**Result:** pnpm test passed 2364 tests across 220 files, 0 errors

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-10-27
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Align vite catalog entry with latest patch
  Change: Bumped vite from ^8.3.4 to ^8.3.5 in catalog
  Result: pnpm test passed 2364 tests across 220 files, 0 errors
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json
  Nudges: 1
  Execution: b8c035e24cd1caaa5914737896ad5ca085d6c5a0
-->
