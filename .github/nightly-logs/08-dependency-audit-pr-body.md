### Nightly Stage 8: Dependency Audit - External Health Auditor

**Status:** CHANGED

In plain terms: this updates dependencies only. No project code was written or changed, though the app should be re-tested before release.

**What changed:** Bumped dependency-cruiser to ^18.7.2 and updated major version watchlist

**Why:** Safe patch bump for dependency-cruiser and tracked new Supabase CLI v3 major release

**Result:** depcruise passed on Frontend-PWA/src, audit:version passed, test passed 2376 tests

**Files changed:** .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml

<!--
NIGHTLY_PR_METADATA:
  Domain: dependencies
  Cycle: nightly-cycle/2026-11-03
  Contract: b865578f1a0b5d4e90f264b4dbb792c4d309c9bbea08fd314cf47cef940ff9b8
  Why: Safe patch bump for dependency-cruiser and tracked new Supabase CLI v3 major release
  Change: Bumped dependency-cruiser to ^18.7.2 and updated major version watchlist
  Result: depcruise passed on Frontend-PWA/src, audit:version passed, test passed 2376 tests
  Files: .github/nightly-logs/08-dependency-audit-coverage.log, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
  Nudges: 0
  Execution: 1df6d802c079c049d3cc76878fd5ebe3177821fa
-->
